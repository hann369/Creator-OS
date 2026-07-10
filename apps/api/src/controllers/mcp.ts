import { Router, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticate, bearerToken } from '../auth.js';
import { createMcpServer } from '../mcp/server.js';

// Remote MCP server — the Claude connector's resource server.
//
// Creator OS is the RESOURCE server only. Supabase Auth is the authorization
// server (Authentication → OAuth Server in the dashboard), so there is no
// /authorize, /token or /register here: Claude discovers Supabase through the
// protected-resource metadata below, registers itself via DCR, and arrives with
// a Supabase-issued JWT.

export const mcpRouter = Router();

const MCP_PATH = '/mcp';

/** The externally visible origin. Vercel terminates TLS, so trust the forwarded proto. */
function baseUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  return `${proto}://${req.get('host')}`;
}

function resourceMetadataUrl(req: Request): string {
  return `${baseUrl(req)}/.well-known/oauth-protected-resource`;
}

// ─── RFC 9728: protected resource metadata ───────────────────────────────────
// Claude probes `/.well-known/oauth-protected-resource/<mcp-path>` before the
// bare path, so both are served. `resource` must equal the URL the user types
// into Claude, character for character.
//
// `scopes_supported` is deliberately absent: Claude requests whatever this
// document advertises, and asking Supabase for a scope it does not issue fails
// the whole authorization. Omitting it lets the authorization server apply its
// own defaults, including `offline_access` for refresh tokens when available.
function protectedResourceMetadata(req: Request, res: Response) {
  res.json({
    resource: `${baseUrl(req)}${MCP_PATH}`,
    authorization_servers: [`${process.env.SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
  });
}

mcpRouter.get('/.well-known/oauth-protected-resource', protectedResourceMetadata);
mcpRouter.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadata);

// ─── CORS ────────────────────────────────────────────────────────────────────
// Claude calls server-to-server and needs none of this; the MCP Inspector runs
// in a browser and does. `WWW-Authenticate` must be exposed or the browser
// client cannot read the 401 handshake.
mcpRouter.use(MCP_PATH, (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── The MCP endpoint ────────────────────────────────────────────────────────

mcpRouter.post(MCP_PATH, async (req: Request, res: Response) => {
  // The 401 must carry `resource_metadata`, and it must be a 401 — Claude
  // ignores WWW-Authenticate on a 200, and a JSON-RPC error would look like a
  // working server with a broken tool.
  const user = await authenticate(bearerToken(req));
  if (!user) {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl(req)}"`);
    return res.status(401).json({ error: 'invalid_token', error_description: 'Bearer token required' });
  }

  const server = createMcpServer(user);
  // Stateless: no session id, so nothing has to survive between Vercel
  // invocations. No tool streams progress, so plain JSON replies beat holding an
  // SSE stream open on a function that will be frozen the moment it returns.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    // express.json() already drained the stream; hand the parsed body over.
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] request failed', err);
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
  }
});

// Streamable HTTP's optional server-push channel is a long-lived SSE stream,
// which a serverless function cannot hold open. Tools work without it.
mcpRouter.get(MCP_PATH, (_req, res) => res.status(405).json({ error: 'method_not_allowed' }));
mcpRouter.delete(MCP_PATH, (_req, res) => res.status(405).json({ error: 'method_not_allowed' }));

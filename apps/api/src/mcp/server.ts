import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EmbeddingProvider } from '@pronoia/ai';
import { resolveProvider } from '@pronoia/ai';
import type { AuthenticatedUser } from '../auth.js';
import { registerTools, type ToolDeps } from './tools.js';

// One McpServer per request. The Streamable HTTP transport runs stateless on
// Vercel (no session id, no long-lived SSE stream), so there is nothing to keep
// alive between calls, and a per-request server keeps one caller's user-scoped
// Supabase client from leaking into another caller's tools.

let embedder: EmbeddingProvider | undefined;

export function defaultDeps(): ToolDeps {
  return {
    embed: (text: string) => {
      // The same provider the ingestion pipeline embeds with, so query vectors
      // land in the space the stored ones live in. (queues/ingestionQueue.ts:47)
      embedder ??= resolveProvider('mistral', {
        mistralKey: process.env.MISTRAL_API_KEY,
      }) as unknown as EmbeddingProvider;
      return embedder.generateEmbedding(text);
    },
  };
}

export function createMcpServer(user: AuthenticatedUser, deps: ToolDeps = defaultDeps()): McpServer {
  const server = new McpServer(
    { name: 'creator-os', version: '1.0.0' },
    {
      instructions:
        "Creator OS is the signed-in user's creative operating system. It holds their content pipeline, " +
        'idea bank, goals, and a library of analysed videos (hooks, transcripts, outlier scores). ' +
        'Prefer search_library for questions about meaning ("what do I know about hooks that open with a question") ' +
        'and filter_library for structured lookups ("all Instagram reels by X above outlier 3"). ' +
        'All data belongs to the authenticated user; this connector is read-only.',
    },
  );
  registerTools(server, user, deps);
  return server;
}

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';

// The MCP connector is the only surface of Creator OS that a stranger's Claude
// account talks to, so these tests pin the two things that keep it safe: the
// unauthenticated 401 handshake (without it Claude can never discover the
// authorization server) and the fact that tools read through a user-scoped
// client rather than the service role.

const PORT = 3011;
const SUPABASE_URL = 'https://mock.supabase.co';
const base = `http://127.0.0.1:${PORT}`;

let server: Server;
let createMcpServer: any;
let McpClient: any;
let InMemoryTransport: any;

before(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

  const { mcpRouter } = await import('../src/controllers/mcp.js');
  ({ createMcpServer } = await import('../src/mcp/server.js'));
  ({ Client: McpClient } = await import('@modelcontextprotocol/sdk/client/index.js'));
  ({ InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js'));

  const app = express();
  app.use(express.json());
  app.use(mcpRouter);
  server = app.listen(PORT);
});

after(() => server?.close());

// ─── A fake Supabase client ──────────────────────────────────────────────────
// PostgREST's builder is chainable and thenable. This records the filters a tool
// applies and resolves with whatever the test staged for that table.

interface Call {
  table: string;
  filters: Array<[string, ...unknown[]]>;
}

function fakeDb(tables: Record<string, unknown>, rpc?: (name: string, args: any) => unknown) {
  const calls: Call[] = [];

  function builder(table: string) {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const result = () => ({ data: tables[table] ?? null, error: null });

    const chain: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(result());
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return async () => {
              const rows = tables[table] as unknown[] | null;
              return { data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null };
            };
          }
          return (...args: unknown[]) => {
            call.filters.push([prop, ...args]);
            return chain;
          };
        },
      },
    );
    return chain;
  }

  return {
    calls,
    db: {
      from: (table: string) => builder(table),
      rpc: async (name: string, args: any) => ({ data: rpc?.(name, args) ?? [], error: null }),
    } as any,
  };
}

async function connect(user: any, deps: any) {
  const server = createMcpServer(user, deps);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new McpClient({ name: 'test', version: '1.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function payload(result: any) {
  return JSON.parse(result.content[0].text);
}

const entryRow = {
  id: 'yt_abc',
  workspace_id: 'main-space',
  platform: 'youtube',
  creator: 'Kallaway',
  url: 'https://youtu.be/abc',
  canonical_url: 'https://youtu.be/abc',
  title: 'Der beste Hook',
  description: 'kurz',
  transcript: 'x'.repeat(5000),
  comments: [{ text: 'nice' }, { text: 'wow' }],
  embedding: new Array(1024).fill(0.01),
  analysis: { topic: 'hooks', hookPattern: 'question' },
  status: 'completed',
  outlier_score: 4.2,
};

// ─── The OAuth handshake ─────────────────────────────────────────────────────

describe('protected resource metadata', () => {
  test('advertises Supabase as the authorization server', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resource, `${base}/mcp`);
    assert.deepEqual(body.authorization_servers, [`${SUPABASE_URL}/auth/v1`]);
  });

  test('is also served under the mcp path suffix Claude probes first', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).resource, `${base}/mcp`);
  });
});

describe('unauthenticated requests', () => {
  test('POST /mcp answers 401 pointing at the resource metadata', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(res.status, 401);
    assert.equal(
      res.headers.get('www-authenticate'),
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    );
  });

  test('a token without the Bearer scheme is rejected', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'some-raw-token' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(res.status, 401);
  });

  test('GET /mcp is refused — a serverless function cannot hold the SSE stream', async () => {
    assert.equal((await fetch(`${base}/mcp`)).status, 405);
  });
});

// ─── The tools ───────────────────────────────────────────────────────────────

describe('tools', () => {
  const user = { userId: 'user-1', email: 'a@b.c', db: null as any };
  const deps = { embed: async () => new Array(1024).fill(0.5) };

  test('every tool is advertised as read-only', async () => {
    const { db } = fakeDb({});
    const client = await connect({ ...user, db }, deps);
    const { tools } = await client.listTools();

    assert.deepEqual(
      tools.map((t: any) => t.name).sort(),
      [
        'filter_library',
        'get_library_entry',
        'get_pipeline_card',
        'list_goals',
        'list_ideas',
        'list_pipeline_cards',
        'list_projects',
        'search_library',
      ],
    );
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be read-only`);
    }
  });

  test('list_pipeline_cards filters by project and status', async () => {
    const { db, calls } = fakeDb({ pipeline_cards: [{ id: 'card-1', title: 'Hook Video' }] });
    const client = await connect({ ...user, db }, deps);

    const result = await client.callTool({
      name: 'list_pipeline_cards',
      arguments: { projectId: 'proj-x', status: 'idea' },
    });

    assert.deepEqual(payload(result).cards, [{ id: 'card-1', title: 'Hook Video' }]);
    const filters = calls[0].filters;
    assert.ok(filters.some(([fn, col, val]) => fn === 'eq' && col === 'workspace_id' && val === 'proj-x'));
    assert.ok(filters.some(([fn, col, val]) => fn === 'eq' && col === 'status' && val === 'idea'));
  });

  test('list_ideas hides archived ideas unless asked', async () => {
    const { db, calls } = fakeDb({ ideas: [] });
    const client = await connect({ ...user, db }, deps);

    await client.callTool({ name: 'list_ideas', arguments: {} });
    assert.ok(calls[0].filters.some(([fn, col, val]) => fn === 'eq' && col === 'archived' && val === false));

    await client.callTool({ name: 'list_ideas', arguments: { includeArchived: true } });
    assert.ok(!calls[1].filters.some(([, col]) => col === 'archived'));
  });

  test('get_pipeline_card reports a missing card as a tool error', async () => {
    const { db } = fakeDb({ pipeline_cards: [] });
    const client = await connect({ ...user, db }, deps);

    const result = await client.callTool({ name: 'get_pipeline_card', arguments: { id: 'nope' } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /nope/);
  });

  test('search_library embeds the query and scopes the match to the caller', async () => {
    let rpcArgs: any;
    const { db } = fakeDb({ content_entries: [entryRow] }, (name, args) => {
      assert.equal(name, 'match_content_entries');
      rpcArgs = args;
      return [{ id: 'yt_abc', similarity: 0.87 }];
    });
    const client = await connect({ ...user, db }, deps);

    const result = await client.callTool({
      name: 'search_library',
      arguments: { query: 'hooks die mit einer Frage starten', limit: 5 },
    });

    assert.equal(rpcArgs.p_owner, 'user-1', 'the RPC must be scoped to the calling user');
    assert.equal(rpcArgs.p_workspace, 'main-space');
    assert.equal(rpcArgs.match_count, 5);
    assert.equal(rpcArgs.query_embedding, `[${new Array(1024).fill(0.5).join(',')}]`);

    const [hit] = payload(result).results;
    assert.equal(hit.id, 'yt_abc');
    assert.equal(hit.similarity, 0.87);
  });

  test('library payloads drop the embedding and truncate the transcript', async () => {
    const { db } = fakeDb({ content_entries: [entryRow] });
    const client = await connect({ ...user, db }, deps);

    const { entries } = payload(await client.callTool({ name: 'filter_library', arguments: {} }));
    const [entry] = entries;

    assert.equal(entry.embedding, undefined, 'a 1024-dim vector must never reach the model');
    assert.equal(entry.transcriptLength, 5000);
    assert.ok(entry.transcript.length < 500, 'list payloads carry a preview, not the full transcript');
    assert.equal(entry.commentCount, 2);
    assert.equal(entry.comments, undefined);
  });

  test('filter_library translates minOutlier into a bound on outlier_score', async () => {
    const { db, calls } = fakeDb({ content_entries: [] });
    const client = await connect({ ...user, db }, deps);

    await client.callTool({ name: 'filter_library', arguments: { minOutlier: 3, platform: 'instagram' } });

    const filters = calls[0].filters;
    assert.ok(filters.some(([fn, col, val]) => fn === 'gte' && col === 'outlier_score' && val === 3));
    assert.ok(filters.some(([fn, col, val]) => fn === 'eq' && col === 'platform' && val === 'instagram'));
  });

  test('get_library_entry keeps more transcript and attaches the derived graph nodes', async () => {
    const { db } = fakeDb({
      content_entries: [entryRow],
      world_nodes: [{ id: 'n1', name: 'Question Hook', type: 'pattern' }],
    });
    const client = await connect({ ...user, db }, deps);

    const body = payload(await client.callTool({ name: 'get_library_entry', arguments: { id: 'yt_abc' } }));
    assert.equal(body.entry.embedding, undefined);
    assert.equal(body.entry.transcript.length, 5000, 'below the detail cap, so it survives whole');
    assert.deepEqual(body.graph, [{ id: 'n1', name: 'Question Hook', type: 'pattern' }]);
  });
});

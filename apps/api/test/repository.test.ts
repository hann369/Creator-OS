import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';

// The generic /repository/:table endpoint writes with the service role, so the
// allowlist is the whole security boundary: a table not on it must be
// unreachable, and it must be rejected before the service role ever touches the
// database. These tests pin both — the pure policy and the router's rejection.

const PORT = 3013;
const base = `http://127.0.0.1:${PORT}`;

let server: Server;
let repositoryTablePolicy: (t: string) => unknown;
let REPOSITORY_TABLES: Record<string, { stampUpdatedAt: boolean }>;

before(async () => {
  process.env.SUPABASE_URL = 'https://mock.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';

  ({ repositoryTablePolicy, REPOSITORY_TABLES } = await import('../src/controllers/repositoryPolicy.js'));
  const { repositoryRouter } = await import('../src/controllers/repository.js');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/repository', repositoryRouter);
  server = app.listen(PORT);
});

after(() => {
  server?.close();
});

describe('repositoryTablePolicy', () => {
  test('every known collection table is on the allowlist', () => {
    for (const t of [
      'goals', 'documents', 'assets', 'people', 'moodboards', 'courses',
      'brand_identities', 'pipeline_cards', 'world_nodes', 'ideas',
      'world_edges', 'relationships', 'ideation_creators',
    ]) {
      assert.ok(repositoryTablePolicy(t), `${t} should be allowlisted`);
    }
  });

  test('an unknown or injected table name resolves to null', () => {
    assert.equal(repositoryTablePolicy('users'), null);
    assert.equal(repositoryTablePolicy('auth.users'), null);
    assert.equal(repositoryTablePolicy('creator_earnings'), null);
    assert.equal(repositoryTablePolicy(''), null);
    // Prototype keys must not leak through the hasOwnProperty guard.
    assert.equal(repositoryTablePolicy('constructor'), null);
    assert.equal(repositoryTablePolicy('toString'), null);
  });

  test('only the tables without an updated_at column skip the stamp', () => {
    const noStamp = Object.entries(REPOSITORY_TABLES)
      .filter(([, p]) => !p.stampUpdatedAt)
      .map(([t]) => t)
      .sort();
    assert.deepEqual(noStamp, ['ideation_creators', 'relationships', 'world_edges']);
  });
});

describe('repository router — allowlist rejection', () => {
  test('GET a non-allowlisted table is rejected with 400, before auth', async () => {
    // No Authorization header: an allowlisted table would 401, a rejected one 400.
    const res = await fetch(`${base}/api/v1/repository/creator_earnings`);
    assert.equal(res.status, 400);
  });

  test('DELETE on a non-allowlisted table is rejected with 400', async () => {
    const res = await fetch(`${base}/api/v1/repository/auth.users/some-id`, { method: 'DELETE' });
    assert.equal(res.status, 400);
  });

  test('an allowlisted table still enforces auth (401 without a token)', async () => {
    const res = await fetch(`${base}/api/v1/repository/goals`);
    assert.equal(res.status, 401);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHybridRepository, type Repository, type Row } from '../src/store/repository.ts';

// Phase C's split: writes to a listed table go through the API adapter (server
// stamps owner_id), everything else — and every READ — goes to the anon Supabase
// fallback. These tests pin that routing so a refactor can't silently send reads
// through the serverless hop or leak a write past the API for a listed table.

function spyRepo(tag: string, calls: string[]): Repository {
  return {
    async list(table, wsId) { calls.push(`${tag}.list:${table}:${wsId ?? '*'}`); return [] as Row[]; },
    async upsert(table, row) { calls.push(`${tag}.upsert:${table}:${row.id}`); },
    async remove(table, id) { calls.push(`${tag}.remove:${table}:${id}`); },
  };
}

test('reads always go to the fallback, never the API', async () => {
  const calls: string[] = [];
  const hybrid = createHybridRepository(['goals'], spyRepo('api', calls), spyRepo('db', calls));
  await hybrid.list('goals', 'ws1');
  await hybrid.list('assets', 'ws1');
  assert.deepEqual(calls, ['db.list:goals:ws1', 'db.list:assets:ws1']);
});

test('writes to a listed table go through the API', async () => {
  const calls: string[] = [];
  const hybrid = createHybridRepository(['goals', 'world_nodes'], spyRepo('api', calls), spyRepo('db', calls));
  await hybrid.upsert('world_nodes', { id: 'n1' });
  await hybrid.remove('goals', 'g1');
  assert.deepEqual(calls, ['api.upsert:world_nodes:n1', 'api.remove:goals:g1']);
});

test('writes to an unlisted table fall back to Supabase', async () => {
  const calls: string[] = [];
  const hybrid = createHybridRepository(['goals'], spyRepo('api', calls), spyRepo('db', calls));
  await hybrid.upsert('library_entries', { id: 'x1' });
  await hybrid.remove('library_entries', 'x1');
  assert.deepEqual(calls, ['db.upsert:library_entries:x1', 'db.remove:library_entries:x1']);
});

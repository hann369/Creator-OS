import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollection } from '../src/store/collection.ts';
import { createMemoryStorage, type Repository, type Row } from '../src/store/repository.ts';
import { setActiveWorkspaceId } from '../src/lib/workspace.ts';

// The collection's policy — first load, seeding, the offline fallback, and the
// reload on a project switch — is the part of the state layer most likely to
// break, and it used to be untestable because it talked to Supabase directly.
// The Repository port (Phase C) lets us drive it against an in-memory backend.

interface Item { id: string; title: string; workspaceId: string }

const toRow = (i: Item): Row => ({ id: i.id, title: i.title, workspace_id: i.workspaceId });
const fromRow = (r: any): Item => ({ id: r.id, title: r.title, workspaceId: r.workspace_id });

/** Records every call, so a test can assert that nothing was written back. */
function fakeRepo(seedRows: Row[] = []) {
  const rows = new Map<string, Row>(seedRows.map((r) => [r.id, r]));
  const calls: string[] = [];
  let failList = false;
  const repo: Repository = {
    async list(table, workspaceId) {
      calls.push(`list:${table}:${workspaceId ?? '*'}`);
      if (failList) throw new Error('offline');
      return [...rows.values()].filter((r) => !workspaceId || r.workspace_id === workspaceId);
    },
    async upsert(table, row) { calls.push(`upsert:${table}:${row.id}`); rows.set(row.id, row); },
    async remove(table, id) { calls.push(`remove:${table}:${id}`); rows.delete(id); },
  };
  return { repo, rows, calls, goOffline: () => { failList = true; } };
}

const make = (repo: Repository, extra: Partial<Parameters<typeof createCollection<Item>>[0]> = {}) =>
  createCollection<Item>({
    table: 'items', lsKey: 'test_items', idOf: (i) => i.id, fromRow, toRow,
    repo, storage: createMemoryStorage(), ...extra,
  });

test('load() pulls the active project rows and mirrors them', async () => {
  setActiveWorkspaceId('main-space');
  const { repo, calls } = fakeRepo([
    { id: 'a', title: 'A', workspace_id: 'main-space' },
    { id: 'b', title: 'B', workspace_id: 'other-project' },
  ]);
  const items = make(repo);
  await items.load();
  assert.deepEqual(items.getAll().map((i) => i.id), ['a'], 'other projects stay out');
  assert.deepEqual(calls, ['list:items:main-space']);
});

test('load() is deduped — repeated calls hit the backend once', async () => {
  const { repo, calls } = fakeRepo();
  const items = make(repo);
  await Promise.all([items.load(), items.load()]);
  await items.load();
  assert.equal(calls.filter((c) => c.startsWith('list')).length, 1);
});

test('account-scoped collections read across projects', async () => {
  setActiveWorkspaceId('main-space');
  const { repo, calls } = fakeRepo([
    { id: 'a', title: 'A', workspace_id: 'main-space' },
    { id: 'b', title: 'B', workspace_id: 'other-project' },
  ]);
  const items = make(repo, { scope: 'account' });
  await items.load();
  assert.deepEqual(items.getAll().map((i) => i.id).sort(), ['a', 'b']);
  assert.deepEqual(calls, ['list:items:*'], 'no workspace filter');
});

test('add/update/remove write through to the repository', async () => {
  const { repo, rows, calls } = fakeRepo();
  const items = make(repo);
  await items.load();

  items.add({ id: 'a', title: 'A', workspaceId: 'main-space' });
  items.update('a', { title: 'A2' });
  assert.equal(rows.get('a')!.title, 'A2');

  items.remove('a');
  assert.equal(rows.size, 0);
  assert.deepEqual(calls.slice(1), ['upsert:items:a', 'upsert:items:a', 'remove:items:a']);
});

test('add() prepends by default and appends when insertAt is end', async () => {
  const first = make(fakeRepo().repo);
  first.add({ id: 'a', title: 'A', workspaceId: 'w' });
  first.add({ id: 'b', title: 'B', workspaceId: 'w' });
  assert.deepEqual(first.getAll().map((i) => i.id), ['b', 'a']);

  const second = make(fakeRepo().repo, { insertAt: 'end' });
  second.add({ id: 'a', title: 'A', workspaceId: 'w' });
  second.add({ id: 'b', title: 'B', workspaceId: 'w' });
  assert.deepEqual(second.getAll().map((i) => i.id), ['a', 'b']);
});

// Realtime echoes must not be re-persisted: otherwise every tab that observes an
// insert writes it back, and our own insert loops.
test('the *Remote methods never write to the repository', async () => {
  const { repo, calls } = fakeRepo();
  const items = make(repo);
  await items.load();
  calls.length = 0;

  items.insertRemote({ id: 'a', title: 'A', workspaceId: 'w' });
  items.replaceRemote({ id: 'a', title: 'A2', workspaceId: 'w' });
  items.dropRemote('a');
  assert.deepEqual(calls, [], 'no backend traffic');
  assert.deepEqual(items.getAll(), []);
});

test('insertRemote keeps a local optimistic item, replaceRemote ignores unknown ids', () => {
  const items = make(fakeRepo().repo);
  items.insertRemote({ id: 'a', title: 'local', workspaceId: 'w' });
  items.insertRemote({ id: 'a', title: 'echo', workspaceId: 'w' });
  assert.equal(items.getAll()[0].title, 'local');

  items.replaceRemote({ id: 'ghost', title: 'nope', workspaceId: 'w' });
  assert.deepEqual(items.getAll().map((i) => i.id), ['a'], 'no phantom row appears');
});

test('an unreachable backend leaves the offline mirror intact', async () => {
  setActiveWorkspaceId('main-space');
  const storage = createMemoryStorage();
  const offline = fakeRepo();

  const before = createCollection<Item>({
    table: 'items', lsKey: 'test_offline', idOf: (i) => i.id, fromRow, toRow,
    repo: offline.repo, storage,
  });
  before.add({ id: 'local', title: 'written while offline', workspaceId: 'main-space' });

  offline.goOffline();
  const after = createCollection<Item>({
    table: 'items', lsKey: 'test_offline', idOf: (i) => i.id, fromRow, toRow,
    repo: offline.repo, storage,
  });
  await after.load();
  assert.deepEqual(after.getAll().map((i) => i.id), ['local'], 'local item survives a failed load');
});

// A forgotten setRepository() is a wiring bug, not an outage. If the offline
// fallback swallowed it the app would look fine and quietly persist nothing.
test('a missing repository registration fails loudly instead of looking offline', async () => {
  const unwired = createCollection<Item>({
    table: 'items', lsKey: 'test_unwired', idOf: (i) => i.id, fromRow, toRow,
    storage: createMemoryStorage(),
    // account scope keeps it from subscribing to project switches — a
    // workspace-scoped one would reload (and reject) during a later test.
    scope: 'account',
  });
  await assert.rejects(() => unwired.load(), /No Repository registered/);
});

test('seed() runs only when both the backend and the mirror are empty', async () => {
  const empty = fakeRepo();
  const seeded = make(empty.repo, { seed: () => [{ id: 's', title: 'Seed', workspaceId: 'main-space' }] });
  await seeded.load();
  assert.deepEqual(seeded.getAll().map((i) => i.id), ['s']);
  assert.equal(empty.rows.get('s')!.title, 'Seed', 'the seed is persisted');

  const populated = fakeRepo([{ id: 'a', title: 'A', workspace_id: 'main-space' }]);
  const notSeeded = make(populated.repo, { seed: () => [{ id: 's', title: 'Seed', workspaceId: 'main-space' }] });
  await notSeeded.load();
  assert.deepEqual(notSeeded.getAll().map((i) => i.id), ['a'], 'existing rows are never overwritten');
});

// The bug fixed in c947265: module-level stores outlive the keyed provider
// remount, so without the broadcast the previous project's rows stayed on screen.
test('switching projects resets the collection and refetches', async () => {
  setActiveWorkspaceId('main-space');
  const { repo, calls } = fakeRepo([
    { id: 'a', title: 'A', workspace_id: 'main-space' },
    { id: 'b', title: 'B', workspace_id: 'proj-2' },
  ]);
  const items = make(repo);
  await items.load();
  assert.deepEqual(items.getAll().map((i) => i.id), ['a']);

  setActiveWorkspaceId('proj-2');
  await new Promise((r) => queueMicrotask(() => r(null)));  // the reload is deferred
  await items.load();

  assert.deepEqual(items.getAll().map((i) => i.id), ['b'], "the previous project's rows are gone");
  assert.deepEqual(calls, ['list:items:main-space', 'list:items:proj-2']);
  setActiveWorkspaceId('main-space');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store/createStore.ts';
import { upsertItem, patchItem, removeItem } from '../src/store/reducers.ts';
import {
  setActiveWorkspaceId, getActiveWorkspaceId, subscribeWorkspaceChange, scopedKey, isDefaultWorkspace,
} from '../src/lib/workspace.ts';

interface Row { id: string; title: string; n?: number }
const idOf = (r: Row) => r.id;

// ─── Store primitive ─────────────────────────────────────────────────────────
test('createStore notifies subscribers only on real changes', () => {
  const store = createStore<number>(0);
  let calls = 0;
  const unsub = store.subscribe(() => { calls++; });

  store.setState(1);
  store.setState((n) => n + 1);
  assert.equal(store.getState(), 2);
  assert.equal(calls, 2);

  store.setState(2); // Object.is equal → no notification
  assert.equal(calls, 2, 'setting the same value does not notify');

  unsub();
  store.setState(9);
  assert.equal(calls, 2, 'unsubscribed listeners are not called');
});

test('snapshot reference is stable until a mutation replaces it', () => {
  const store = createStore<Row[]>([{ id: 'a', title: 'A' }]);
  const first = store.getState();
  assert.equal(store.getState(), first, 'same reference between reads (safe for useSyncExternalStore)');
  store.setState(upsertItem(store.getState(), { id: 'b', title: 'B' }, idOf));
  assert.notEqual(store.getState(), first, 'reference changes after a mutation');
});

// ─── Pure reducers ───────────────────────────────────────────────────────────
test('upsertItem inserts new items at the front and replaces by id', () => {
  const a: Row = { id: 'a', title: 'A' };
  const b: Row = { id: 'b', title: 'B' };
  const items = upsertItem([a], b, idOf);
  assert.deepEqual(items.map(idOf), ['b', 'a'], 'new item goes to the front');

  const replaced = upsertItem(items, { id: 'a', title: 'A2' }, idOf);
  assert.equal(replaced.find((r) => r.id === 'a')!.title, 'A2');
  assert.equal(replaced.length, 2, 'replacing does not grow the list');
});

test('patchItem shallow-merges and is a no-op for a missing id', () => {
  const items: Row[] = [{ id: 'a', title: 'A', n: 1 }];
  const patched = patchItem(items, 'a', { n: 5 }, idOf);
  assert.deepEqual(patched[0], { id: 'a', title: 'A', n: 5 });

  const same = patchItem(items, 'missing', { n: 9 }, idOf);
  assert.equal(same, items, 'no-op returns the same array reference');
});

test('removeItem deletes by id and no-ops when absent', () => {
  const items: Row[] = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  assert.deepEqual(removeItem(items, 'a', idOf).map(idOf), ['b']);
  assert.equal(removeItem(items, 'x', idOf), items, 'no-op keeps the same reference');
});

// ─── Workspace scope broadcast ───────────────────────────────────────────────
// Module-level collection stores outlive the keyed WorkspaceProvider remount, so
// they only learn about a project switch through this broadcast. Without it they
// keep serving the previous project's rows.
test('setActiveWorkspaceId notifies subscribers only when the project changes', () => {
  let calls = 0;
  const unsub = subscribeWorkspaceChange(() => { calls++; });

  setActiveWorkspaceId('proj-a');
  assert.equal(getActiveWorkspaceId(), 'proj-a');
  assert.equal(calls, 1);

  setActiveWorkspaceId('proj-a'); // same project → no reload
  assert.equal(calls, 1);

  setActiveWorkspaceId('proj-b');
  assert.equal(calls, 2);

  unsub();
  setActiveWorkspaceId('main-space');
  assert.equal(calls, 2, 'unsubscribed listeners are not called');
});

test('scopedKey namespaces every project except the default one', () => {
  setActiveWorkspaceId('main-space');
  assert.equal(scopedKey('pronoia_goals'), 'pronoia_goals');
  assert.equal(isDefaultWorkspace(), true);

  setActiveWorkspaceId('proj-x');
  assert.equal(scopedKey('pronoia_goals'), 'pronoia_goals:proj-x');
  assert.equal(isDefaultWorkspace(), false);

  setActiveWorkspaceId('main-space'); // restore for any later test
});

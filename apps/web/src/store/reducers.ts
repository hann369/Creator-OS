// Pure array reducers for entity collections (Roadmap Phase B).
// Framework-free and IO-free → unit tested in isolation. The collection factory
// wraps these with Supabase + localStorage.

/**
 * Insert a new item, or replace an existing one with the same id. New items go
 * to the front unless `at` says otherwise — the graph and pipeline lists read
 * as creation order, so they append.
 */
export function upsertItem<T>(items: T[], item: T, idOf: (i: T) => string, at: 'start' | 'end' = 'start'): T[] {
  const idx = items.findIndex((i) => idOf(i) === idOf(item));
  if (idx >= 0) { const next = items.slice(); next[idx] = item; return next; }
  return at === 'end' ? [...items, item] : [item, ...items];
}

/** Insert only if the id is absent (returns the same array otherwise). */
export function insertItem<T>(items: T[], item: T, idOf: (i: T) => string, at: 'start' | 'end' = 'start'): T[] {
  if (items.some((i) => idOf(i) === idOf(item))) return items;
  return at === 'end' ? [...items, item] : [item, ...items];
}

/** Replace an existing item wholesale (returns the same array if the id is absent). */
export function replaceItem<T>(items: T[], item: T, idOf: (i: T) => string): T[] {
  const idx = items.findIndex((i) => idOf(i) === idOf(item));
  if (idx < 0) return items;
  const next = items.slice();
  next[idx] = item;
  return next;
}

/** Shallow-merge a patch into the item with the given id (no-op if absent). */
export function patchItem<T>(items: T[], id: string, patch: Partial<T>, idOf: (i: T) => string): T[] {
  let changed = false;
  const next = items.map((i) => {
    if (idOf(i) !== id) return i;
    changed = true;
    return { ...i, ...patch };
  });
  return changed ? next : items;
}

/** Remove the item with the given id (returns the same array if nothing matched). */
export function removeItem<T>(items: T[], id: string, idOf: (i: T) => string): T[] {
  const next = items.filter((i) => idOf(i) !== id);
  return next.length === items.length ? items : next;
}

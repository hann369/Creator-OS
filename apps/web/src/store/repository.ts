// ─────────────────────────────────────────────────────────────────────────────
// THE REPOSITORY PORT (Roadmap Phase C).
//
// Every collection used to reach `supabase` directly, which welded the state
// layer to one backend and to the browser: importing collection.ts outside a
// bundler blew up on `import.meta.env`, so the load/seed/offline/reload policy —
// the part most likely to break — could never be unit tested.
//
// The port is deliberately row-shaped rather than entity-shaped. Collections
// already own the row ↔ model mapping; what they need from persistence is only
// "give me the rows for this table", "write this row", "delete this id". A
// server-mediated adapter (writes through the API instead of the anon client)
// implements the same three methods.
// ─────────────────────────────────────────────────────────────────────────────

export type Row = Record<string, any> & { id: string };

export interface Repository {
  /**
   * Every row of a table, optionally narrowed to one workspace.
   * REJECTS when the backend is unreachable or the table is missing — callers
   * treat that as "stay offline", which is why it must not resolve to [].
   */
  list(table: string, workspaceId?: string): Promise<Row[]>;
  /** Insert or replace by primary key `id`. */
  upsert(table: string, row: Row): Promise<void>;
  /** Delete by primary key. */
  remove(table: string, id: string): Promise<void>;
}

/** The offline mirror's backing store — `localStorage` in the browser. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Used when there is no `localStorage` (tests, SSR): mirroring becomes a no-op cache. */
export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

export const defaultStorage: KeyValueStorage =
  typeof localStorage !== 'undefined' ? localStorage : createMemoryStorage();

// ─── Registry ────────────────────────────────────────────────────────────────
// Wired once by main.tsx. Collections resolve the repository lazily, on their
// first read or write, never at module-construction time — so import order
// between the store modules and the entry point does not matter.

let current: Repository | null = null;

export function setRepository(repo: Repository): void {
  current = repo;
}

export function getRepository(): Repository {
  if (!current) {
    throw new Error(
      'No Repository registered. The app wires one in main.tsx (setRepository); ' +
      'tests pass their own through createCollection({ repo }).',
    );
  }
  return current;
}

/**
 * Splits persistence by operation (Roadmap Phase C):
 *   • WRITES (upsert/remove) to a listed table go through `apiRepo` — the server
 *     stamps owner_id with the service role, so persistence no longer trusts the
 *     browser's RLS context. This is the actual goal of Phase C ("move writes
 *     behind the API instead of the browser anon client").
 *   • READS always go to `fallbackRepo` (the anon Supabase client): RLS already
 *     scopes reads to the owner, and reading direct is faster and more reliable
 *     than adding a serverless hop — it also keeps local dev working when the API
 *     server isn't up. Writes to an unlisted table also fall back.
 */
export function createHybridRepository(
  writeApiTables: string[],
  apiRepo: Repository,
  fallbackRepo: Repository
): Repository {
  const viaApi = (table: string) => writeApiTables.includes(table);
  return {
    list(table, wsId) {
      return fallbackRepo.list(table, wsId);
    },
    upsert(table, row) {
      return viaApi(table) ? apiRepo.upsert(table, row) : fallbackRepo.upsert(table, row);
    },
    remove(table, id) {
      return viaApi(table) ? apiRepo.remove(table, id) : fallbackRepo.remove(table, id);
    },
  };
}

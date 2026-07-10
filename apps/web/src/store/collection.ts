import { useEffect } from 'react';
import { createStore } from './createStore.js';
import { useStore } from './useStore.js';
import { upsertItem, insertItem, replaceItem, patchItem, removeItem } from './reducers.js';
import { getRepository, defaultStorage, type KeyValueStorage, type Repository } from './repository.js';
import { getActiveWorkspaceId, scopedKey, subscribeWorkspaceChange } from '../lib/workspace.js';

// ─────────────────────────────────────────────────────────────────────────────
// Entity collection (Roadmap Phase B).
//
// One reusable, project-scoped store for a persisted entity type, with an
// offline mirror. Replaces the copy-pasted load/persist/upsert/delete logic that
// lived independently in useGoals/useDocuments/useAssets/usePeople. The state
// mutation logic is factored into PURE reducers (./reducers); the IO goes
// through the Repository port (./repository), so this whole factory — load,
// seed, offline fallback, project-switch reload — is unit tested against an
// in-memory repository rather than against a live Supabase.
// ─────────────────────────────────────────────────────────────────────────────

export interface CollectionConfig<T> {
  table: string;                 // backing table
  lsKey: string;                 // offline mirror key (scoped per workspace)
  idOf: (item: T) => string;
  fromRow: (row: any) => T;
  toRow: (item: T) => any;
  /** Whether update() should stamp updatedAt (all current entity types have it). */
  stampUpdatedAt?: boolean;
  /**
   * Optional starter items, created once when the remote load succeeds and both
   * the table and the local mirror are empty. Never overwrites existing data,
   * so offline-created items survive a first successful sync.
   */
  seed?: () => T[];
  /**
   * 'workspace' (default) loads only the active project's rows and namespaces
   * the mirror per project. 'account' loads every row the user can read and
   * keeps one un-namespaced mirror — for types that are deliberately
   * cross-project, like ideas (the Telegram bot files them into any project and
   * IdeationView filters client-side).
   */
  scope?: 'workspace' | 'account';
  /**
   * Where add() puts a new item. Lists that read as creation order — the graph
   * nodes/edges and the pipeline columns — append; everything else shows the
   * newest first.
   */
  insertAt?: 'start' | 'end';
  /** Persistence. Defaults to the app-wide repository wired in main.tsx. */
  repo?: Repository;
  /** Offline mirror backing store. Defaults to localStorage. */
  storage?: KeyValueStorage;
}

export interface Collection<T> {
  getAll: () => T[];
  useItems: () => T[];
  /** Whether the first remote load has settled. Reactive; for spinners. */
  useLoaded: () => boolean;
  /** Await the first remote load. Safe to call repeatedly — it only runs once. */
  load: () => Promise<void>;
  add: (item: T) => void;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;

  // ── Changes that arrived FROM the backend (Supabase realtime) ──────────────
  // They update the state and the offline mirror but never write back, so an
  // echo of our own insert cannot loop, and another client's change cannot be
  // re-persisted by every tab that sees it.
  /** INSERT: add unless the id is already known (keeps a local optimistic item). */
  insertRemote: (item: T) => void;
  /** UPDATE: replace the known item; ignore an id we have never seen. */
  replaceRemote: (item: T) => void;
  /** DELETE: forget the id. */
  dropRemote: (id: string) => void;
}

export function createCollection<T>(cfg: CollectionConfig<T>): Collection<T> {
  const accountScoped = cfg.scope === 'account';
  const insertAt = cfg.insertAt ?? 'start';
  const storage = cfg.storage ?? defaultStorage;
  // Resolved per call, never at construction: the app registers its repository
  // in main.tsx, which runs after these module-level collections are created.
  const repo = (): Repository => cfg.repo ?? getRepository();
  const storageKey = () => (accountScoped ? cfg.lsKey : scopedKey(cfg.lsKey));

  const loadLocal = (): T[] => {
    try {
      const raw = storage.getItem(storageKey());
      if (raw) return (JSON.parse(raw) as any[]).map(cfg.fromRow);
    } catch { /* ignore */ }
    return [];
  };

  const store = createStore<T[]>(loadLocal());
  const loaded = createStore<boolean>(false);
  let inFlight: Promise<void> | null = null;

  const mirror = (items: T[]) => {
    try { storage.setItem(storageKey(), JSON.stringify(items.map(cfg.toRow))); } catch { /* ignore */ }
  };

  interface PendingWrite {
    id: string;
    type: 'upsert' | 'delete';
    row?: any;
  }

  const pendingKey = () => storageKey() + '_pending';

  const getPending = (): PendingWrite[] => {
    try {
      const raw = storage.getItem(pendingKey());
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
  };

  const setPending = (pending: PendingWrite[]) => {
    try {
      if (pending.length === 0) {
        storage.setItem(pendingKey(), '[]');
      } else {
        storage.setItem(pendingKey(), JSON.stringify(pending));
      }
    } catch { /* ignore */ }
  };

  let syncing = false;
  async function syncPending() {
    if (syncing) return;
    syncing = true;
    try {
      const backend = repo();
      const pending = getPending();
      for (const pw of pending) {
        try {
          if (pw.type === 'delete') {
            await backend.remove(cfg.table, pw.id);
          } else if (pw.type === 'upsert') {
            await backend.upsert(cfg.table, pw.row);
          }
          setPending(getPending().filter(p => p.id !== pw.id));
        } catch (err) {
          break; // Stop syncing on network error
        }
      }
    } finally {
      syncing = false;
    }
  }

  function ensureLoaded(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      // Resolved before the try: a missing registration is a wiring bug, so it
      // must reject the promise rather than be swallowed as "offline" below.
      const backend = repo();
      try {
        const rows = await backend.list(cfg.table, accountScoped ? undefined : getActiveWorkspaceId());

        if (rows.length === 0 && cfg.seed && store.getState().length === 0) {
          const seeded = cfg.seed();
          if (seeded.length > 0) {
            store.setState(seeded);
            mirror(seeded);
            for (const item of seeded) {
              backend.upsert(cfg.table, cfg.toRow(item)).then(() => {}, () => {});
            }
            return;
          }
        }

        const mapped = rows.map(cfg.fromRow);
        
        // Merge pending writes
        const pending = getPending();
        let merged = [...mapped];
        for (const pw of pending) {
          if (pw.type === 'delete') {
            merged = merged.filter(item => cfg.idOf(item) !== pw.id);
          } else if (pw.type === 'upsert') {
            const item = cfg.fromRow(pw.row);
            const index = merged.findIndex(i => cfg.idOf(i) === pw.id);
            if (index !== -1) {
              merged[index] = item;
            } else {
              if (insertAt === 'start') {
                merged.unshift(item);
              } else {
                merged.push(item);
              }
            }
          }
        }

        store.setState(merged);
        mirror(merged);
        
        void syncPending();
      } catch { 
        /* offline → keep local */ 
        void syncPending();
      }
      finally { loaded.setState(true); }
    })();
    return inFlight;
  }

  // A project switch remounts the workspace subtree, but this store is module
  // level and survives it — without this, the previous project's rows stay on
  // screen and ensureLoaded's dedupe means they are never refetched. Deferred to
  // a microtask because setActiveWorkspaceId runs during render.
  if (!accountScoped) {
    subscribeWorkspaceChange(() => {
      queueMicrotask(() => {
        inFlight = null;
        loaded.setState(false);
        store.setState(loadLocal());
        void ensureLoaded();
      });
    });
  }

  /** State + offline mirror only — for changes that came from the backend. */
  function applyLocal(next: T[]) {
    if (next === store.getState()) return;
    store.setState(next);
    mirror(next);
  }

  function commit(next: T[], changed: T | undefined, isDelete = false, id?: string) {
    store.setState(next);
    mirror(next);

    const itemId = id || (changed ? cfg.idOf(changed) : undefined);
    if (itemId) {
      const pending = getPending();
      const filtered = pending.filter(p => p.id !== itemId);
      if (isDelete) {
        filtered.push({ id: itemId, type: 'delete' });
      } else if (changed) {
        filtered.push({ id: itemId, type: 'upsert', row: cfg.toRow(changed) });
      }
      setPending(filtered);
    }

    if (isDelete && id) {
      repo().remove(cfg.table, id).then(
        () => {
          setPending(getPending().filter(p => p.id !== id));
        },
        () => {}
      );
    } else if (changed) {
      const itemId = cfg.idOf(changed);
      repo().upsert(cfg.table, cfg.toRow(changed)).then(
        () => {
          setPending(getPending().filter(p => p.id !== itemId));
        },
        () => {}
      );
    }
  }

  return {
    getAll: () => store.getState(),
    load: ensureLoaded,
    useItems: () => {
      useEffect(() => { void ensureLoaded(); }, []);
      return useStore(store);
    },
    useLoaded: () => {
      useEffect(() => { void ensureLoaded(); }, []);
      return useStore(loaded);
    },
    add: (item) => commit(upsertItem(store.getState(), item, cfg.idOf, insertAt), item),
    update: (id, patch) => {
      const stamped = cfg.stampUpdatedAt ? ({ ...patch, updatedAt: new Date() } as Partial<T>) : patch;
      const next = patchItem(store.getState(), id, stamped, cfg.idOf);
      commit(next, next.find((i) => cfg.idOf(i) === id));
    },
    remove: (id) => commit(removeItem(store.getState(), id, cfg.idOf), undefined, true, id),

    insertRemote: (item) => applyLocal(insertItem(store.getState(), item, cfg.idOf, insertAt)),
    replaceRemote: (item) => applyLocal(replaceItem(store.getState(), item, cfg.idOf)),
    dropRemote: (id) => applyLocal(removeItem(store.getState(), id, cfg.idOf)),
  };
}

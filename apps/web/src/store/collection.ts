import { useEffect } from 'react';
import { createStore } from './createStore.js';
import { useStore } from './useStore.js';
import { upsertItem, patchItem, removeItem } from './reducers.js';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId, scopedKey, subscribeWorkspaceChange } from '../lib/workspace.js';

// ─────────────────────────────────────────────────────────────────────────────
// Entity collection (Roadmap Phase B).
//
// One reusable, project-scoped store for a Supabase-backed entity type, with an
// offline localStorage mirror. Replaces the copy-pasted load/persist/upsert/
// delete logic that lived independently in useGoals/useDocuments/useAssets/
// usePeople. The state mutation logic is factored into PURE reducers (./reducers,
// unit tested); this factory wraps them with the Supabase + localStorage IO.
// ─────────────────────────────────────────────────────────────────────────────

export interface CollectionConfig<T> {
  table: string;                 // Supabase table
  lsKey: string;                 // localStorage mirror key (scoped per workspace)
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
}

export function createCollection<T>(cfg: CollectionConfig<T>): Collection<T> {
  const accountScoped = cfg.scope === 'account';
  const storageKey = () => (accountScoped ? cfg.lsKey : scopedKey(cfg.lsKey));

  const loadLocal = (): T[] => {
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) return (JSON.parse(raw) as any[]).map(cfg.fromRow);
    } catch { /* ignore */ }
    return [];
  };

  const store = createStore<T[]>(loadLocal());
  const loaded = createStore<boolean>(false);
  let inFlight: Promise<void> | null = null;

  const mirror = (items: T[]) => {
    try { localStorage.setItem(storageKey(), JSON.stringify(items.map(cfg.toRow))); } catch { /* ignore */ }
  };

  function ensureLoaded(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const query = supabase.from(cfg.table).select('*');
        const r = await (accountScoped ? query : query.eq('workspace_id', getActiveWorkspaceId()));
        if (r.error || !r.data) return;

        if (r.data.length === 0 && cfg.seed && store.getState().length === 0) {
          const seeded = cfg.seed();
          if (seeded.length > 0) {
            store.setState(seeded);
            mirror(seeded);
            for (const item of seeded) {
              supabase.from(cfg.table).upsert(cfg.toRow(item), { onConflict: 'id' }).then(() => {}, () => {});
            }
            return;
          }
        }

        const mapped = r.data.map(cfg.fromRow);
        store.setState(mapped);
        mirror(mapped);
      } catch { /* offline → keep local */ }
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

  function commit(next: T[], changed: T | undefined, isDelete = false, id?: string) {
    store.setState(next);
    mirror(next);
    if (isDelete && id) {
      supabase.from(cfg.table).delete().eq('id', id).then(() => {}, () => {});
    } else if (changed) {
      supabase.from(cfg.table).upsert(cfg.toRow(changed), { onConflict: 'id' }).then(() => {}, () => {});
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
    add: (item) => commit(upsertItem(store.getState(), item, cfg.idOf), item),
    update: (id, patch) => {
      const stamped = cfg.stampUpdatedAt ? ({ ...patch, updatedAt: new Date() } as Partial<T>) : patch;
      const next = patchItem(store.getState(), id, stamped, cfg.idOf);
      commit(next, next.find((i) => cfg.idOf(i) === id));
    },
    remove: (id) => commit(removeItem(store.getState(), id, cfg.idOf), undefined, true, id),
  };
}

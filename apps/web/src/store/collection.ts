import { useEffect } from 'react';
import { createStore } from './createStore.js';
import { useStore } from './useStore.js';
import { upsertItem, patchItem, removeItem } from './reducers.js';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId, scopedKey } from '../lib/workspace.js';

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
}

export interface Collection<T> {
  getAll: () => T[];
  useItems: () => T[];
  add: (item: T) => void;
  update: (id: string, patch: Partial<T>) => void;
  remove: (id: string) => void;
}

export function createCollection<T>(cfg: CollectionConfig<T>): Collection<T> {
  const loadLocal = (): T[] => {
    try {
      const raw = localStorage.getItem(scopedKey(cfg.lsKey));
      if (raw) return (JSON.parse(raw) as any[]).map(cfg.fromRow);
    } catch { /* ignore */ }
    return [];
  };

  const store = createStore<T[]>(loadLocal());
  let started = false;

  const mirror = (items: T[]) => {
    try { localStorage.setItem(scopedKey(cfg.lsKey), JSON.stringify(items.map(cfg.toRow))); } catch { /* ignore */ }
  };

  async function ensureLoaded() {
    if (started) return;
    started = true;
    try {
      const r = await supabase.from(cfg.table).select('*').eq('workspace_id', getActiveWorkspaceId());
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
    useItems: () => {
      useEffect(() => { void ensureLoaded(); }, []);
      return useStore(store);
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

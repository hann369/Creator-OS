import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId, scopedKey } from '../lib/workspace.js';

// Assets as a first-class, project-scoped store (the `asset` face of the entity
// spine): images/videos/audio/pdfs referenced by URL, optionally linked to a
// pipeline card. Supabase + offline localStorage mirror, mirroring useGoals.

export const ASSET_KINDS = ['image', 'video', 'audio', 'pdf', 'other'] as const;
export type AssetKind = typeof ASSET_KINDS[number];

export interface AssetItem {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  kind: AssetKind;
  tags: string[];
  linkedCardId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ASSETS_LS = 'pronoia_assets';
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

function rowToAsset(r: any): AssetItem {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    title: r.title ?? '', url: r.url ?? '',
    kind: (r.asset_kind ?? r.kind ?? 'other') as AssetKind,
    tags: r.tags ?? [], linkedCardId: r.linked_card_id ?? r.linkedCardId ?? undefined,
    createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
    updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
  };
}
function assetToRow(a: AssetItem) {
  return {
    id: a.id, workspace_id: a.workspaceId, title: a.title, url: a.url,
    asset_kind: a.kind, tags: a.tags, linked_card_id: a.linkedCardId ?? null,
    created_at: a.createdAt.toISOString(), updated_at: a.updatedAt.toISOString(),
  };
}

function loadLocal(): AssetItem[] {
  try { const raw = localStorage.getItem(scopedKey(ASSETS_LS)); if (raw) return (JSON.parse(raw) as any[]).map(rowToAsset); } catch { /* ignore */ }
  return [];
}
function persistLocal(items: unknown[]) {
  try { localStorage.setItem(scopedKey(ASSETS_LS), JSON.stringify(items)); } catch { /* ignore */ }
}

/** Best-effort asset kind from a URL extension. */
export function guessKind(url: string): AssetKind {
  const u = url.toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(u)) return 'image';
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(u)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|flac)$/.test(u)) return 'audio';
  if (/\.pdf$/.test(u)) return 'pdf';
  return 'other';
}

export function useAssets() {
  const [assets, setAssets] = useState<AssetItem[]>(() => loadLocal());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ws = getActiveWorkspaceId();
      try {
        const r = await supabase.from('assets').select('*').eq('workspace_id', ws);
        if (cancelled) return;
        if (!r.error && r.data) { setAssets(r.data.map(rowToAsset)); persistLocal(r.data); }
      } catch { /* offline → keep local */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const addAsset = useCallback((input: { title: string; url: string; kind?: AssetKind }): AssetItem => {
    const now = new Date();
    const a: AssetItem = {
      id: uid('asset'), workspaceId: getActiveWorkspaceId(),
      title: input.title.trim() || 'Untitled', url: input.url.trim(),
      kind: input.kind ?? guessKind(input.url), tags: [], createdAt: now, updatedAt: now,
    };
    setAssets(prev => { const next = [a, ...prev]; persistLocal(next.map(assetToRow)); return next; });
    supabase.from('assets').upsert(assetToRow(a), { onConflict: 'id' }).then(() => {}, () => {});
    return a;
  }, []);

  const updateAsset = useCallback((id: string, patch: Partial<AssetItem>) => {
    setAssets(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...patch, updatedAt: new Date() } : a);
      persistLocal(next.map(assetToRow));
      const updated = next.find(a => a.id === id);
      if (updated) supabase.from('assets').upsert(assetToRow(updated), { onConflict: 'id' }).then(() => {}, () => {});
      return next;
    });
  }, []);

  const deleteAsset = useCallback((id: string) => {
    setAssets(prev => { const next = prev.filter(a => a.id !== id); persistLocal(next.map(assetToRow)); return next; });
    supabase.from('assets').delete().eq('id', id).then(() => {}, () => {});
  }, []);

  return { assets, addAsset, updateAsset, deleteAsset };
}

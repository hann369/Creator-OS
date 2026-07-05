import { useCallback } from 'react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from '../store/collection.js';

// Assets as a first-class, project-scoped store (the `asset` face of the entity
// spine): images/videos/audio/pdfs referenced by URL, optionally linked to a
// pipeline card. Backed by the shared entity collection (Roadmap Phase B).

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

/** Best-effort asset kind from a URL extension. */
export function guessKind(url: string): AssetKind {
  const u = url.toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(u)) return 'image';
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(u)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|flac)$/.test(u)) return 'audio';
  if (/\.pdf$/.test(u)) return 'pdf';
  return 'other';
}

const assets = createCollection<AssetItem>({
  table: 'assets', lsKey: 'pronoia_assets', idOf: (a) => a.id,
  fromRow: rowToAsset, toRow: assetToRow, stampUpdatedAt: true,
});

export function useAssets() {
  const items = assets.useItems();

  const addAsset = useCallback((input: { title: string; url: string; kind?: AssetKind }): AssetItem => {
    const now = new Date();
    const a: AssetItem = {
      id: uid('asset'), workspaceId: getActiveWorkspaceId(),
      title: input.title.trim() || 'Untitled', url: input.url.trim(),
      kind: input.kind ?? guessKind(input.url), tags: [], createdAt: now, updatedAt: now,
    };
    assets.add(a);
    return a;
  }, []);

  const updateAsset = useCallback((id: string, patch: Partial<AssetItem>) => assets.update(id, patch), []);
  const deleteAsset = useCallback((id: string) => assets.remove(id), []);

  return { assets: items, addAsset, updateAsset, deleteAsset };
}

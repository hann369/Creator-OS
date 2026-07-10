import type { BrandIdentity } from '@pronoia/domain';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from './collection.js';

// The project's BrandIdentities as one shared store (Roadmap Phase B).
//
// Both readers go through here: useIdentity (the view) and runIdentityLearning
// (the loop WorkspaceContext fires whenever card metrics change). They used to
// reach the DB independently via entityStore, so a re-ranked identity written by
// the loop never reached the mounted view.
//
// brand_identities keeps the rich entity in a jsonb `data` column and mirrors
// only id/title/workspace_id/timestamps as real columns.

function rowToIdentity(row: any): BrandIdentity {
  // Tolerates the legacy localStorage shape, where the whole entity was stored
  // flat rather than nested under `data`.
  const data = row?.data ?? row ?? {};
  return {
    ...data,
    id: row.id,
    workspaceId: row.workspace_id ?? row.workspaceId ?? getActiveWorkspaceId(),
    type: 'identity',
    title: row.title ?? data.title ?? 'Brand Identity',
    metadata: data.metadata ?? {},
    colors: data.colors ?? [],
    typography: data.typography ?? {},
    voice: data.voice ?? { doList: [], dontList: [] },
    hooks: data.hooks ?? [],
    moodboardIds: data.moodboardIds ?? [],
    createdAt: new Date(row.created_at ?? row.createdAt ?? Date.now()),
    updatedAt: new Date(row.updated_at ?? row.updatedAt ?? Date.now()),
  } as BrandIdentity;
}

function identityToRow(i: BrandIdentity) {
  return {
    id: i.id,
    workspace_id: i.workspaceId,
    title: i.title,
    data: i,
    created_at: i.createdAt.toISOString(),
    updated_at: i.updatedAt.toISOString(),
  };
}

export const identities = createCollection<BrandIdentity>({
  table: 'brand_identities', lsKey: 'pronoia_identities', idOf: (i) => i.id,
  fromRow: rowToIdentity, toRow: identityToRow, stampUpdatedAt: true,
});

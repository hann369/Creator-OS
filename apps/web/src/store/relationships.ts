import type { Relationship } from '@pronoia/domain';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from './collection.js';

// The project's Relationships as one shared store (Roadmap Phase B).
//
// Relationships have two classes of writer: the UI (MoodboardsView links a board
// to a card via useRelationships) and background code that calls
// `entityStore.link()` — brand-DNA provenance on import, the identity/moodboard
// link in useIdentity. Those used to write straight to Supabase, so a link made
// by one never appeared in the other's mounted state until a reload. Both now go
// through this collection.

export function rowToRelationship(raw: any): Relationship {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId ?? raw.workspace_id ?? getActiveWorkspaceId(),
    sourceId: raw.sourceId ?? raw.source_id,
    targetId: raw.targetId ?? raw.target_id,
    type: raw.type ?? raw.relationship_type,
    weight: raw.weight != null ? parseFloat(raw.weight) : undefined,
    metadata: raw.metadata ?? {},
    createdAt: new Date(raw.createdAt ?? raw.created_at ?? new Date()),
  };
}

export function relationshipToRow(r: Relationship) {
  return {
    id: r.id,
    workspace_id: r.workspaceId,
    source_id: r.sourceId,
    target_id: r.targetId,
    type: r.type,
    weight: r.weight ?? null,
    metadata: r.metadata ?? {},
    created_at: r.createdAt.toISOString(),
  };
}

export const relationships = createCollection<Relationship>({
  table: 'relationships', lsKey: 'pronoia_relationships', idOf: (r) => r.id,
  fromRow: rowToRelationship, toRow: relationshipToRow,
});

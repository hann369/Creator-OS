import { useCallback } from 'react';
import type { Relationship, RelationshipType } from '@pronoia/domain';
import { relationships as relationshipStore } from '../store/relationships.js';
import { getActiveWorkspaceId } from '../lib/workspace.js';

// Persistence (Supabase + localStorage + row mapping) lives in the shared
// relationship collection (Roadmap Phase B). This hook is a thin React binding:
// every consumer — and every background writer going through entityStore.link —
// observes the same store.

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export function useRelationships() {
  const relationships = relationshipStore.useItems();
  const isLoading = !relationshipStore.useLoaded();

  const addRelationship = useCallback((sourceId: string, targetId: string, type: RelationshipType): string => {
    // Prevent exact duplicates — the same pair may be linked from several views.
    const existing = relationshipStore
      .getAll()
      .find(x => x.sourceId === sourceId && x.targetId === targetId && x.type === type);
    if (existing) return existing.id;

    const r: Relationship = {
      id: uid('rel'),
      workspaceId: getActiveWorkspaceId(),
      sourceId,
      targetId,
      type,
      createdAt: new Date(),
    };
    relationshipStore.add(r);
    return r.id;
  }, []);

  const removeRelationship = useCallback((id: string): void => {
    relationshipStore.remove(id);
  }, []);

  const relationshipsFor = useCallback((entityId: string): Relationship[] => {
    return relationships.filter(r => r.sourceId === entityId || r.targetId === entityId);
  }, [relationships]);

  const findRelationship = useCallback((sourceId: string, targetId: string, type: RelationshipType): Relationship | undefined => {
    return relationships.find(r => r.sourceId === sourceId && r.targetId === targetId && r.type === type);
  }, [relationships]);

  return {
    relationships,
    isLoading,
    addRelationship,
    removeRelationship,
    relationshipsFor,
    findRelationship,
  };
}

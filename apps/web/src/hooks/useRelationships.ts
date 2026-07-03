import { useState, useEffect, useCallback } from 'react';
import type { Relationship, RelationshipType } from '@pronoia/domain';
import { entityStore } from '../lib/entityStore.js';
import { getActiveWorkspaceId } from '../lib/workspace.js';

// Persistence (Supabase + localStorage + row mapping) now lives in the shared
// SupabaseEntityStore adapter (Roadmap Step 3). This hook keeps only the React
// state model + the optimistic UI; it delegates every read/write to the store.

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export function useRelationships() {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await entityStore.loadAll();
      if (!cancelled) {
        setRelationships(all);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const addRelationship = useCallback((sourceId: string, targetId: string, type: RelationshipType): string => {
    const r: Relationship = {
      id: uid('rel'),
      workspaceId: getActiveWorkspaceId(),
      sourceId,
      targetId,
      type,
      createdAt: new Date(),
    };
    setRelationships(prev => {
      // Prevent exact duplicates
      const exists = prev.some(x => x.sourceId === sourceId && x.targetId === targetId && x.type === type);
      if (exists) return prev;
      const next = [...prev, r];
      entityStore.save(r); // background persist (keeps this optimistic id)
      return next;
    });
    return r.id;
  }, []);

  const removeRelationship = useCallback((id: string): void => {
    setRelationships(prev => prev.filter(r => r.id !== id));
    entityStore.unlink(id);
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

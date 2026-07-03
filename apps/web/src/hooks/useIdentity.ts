import { useState, useEffect, useCallback } from 'react';
import type { BrandIdentity, Moodboard } from '@pronoia/domain';
import { BrandIdentityEngine } from '@pronoia/identity';
import { entityStore } from '../lib/entityStore.js';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { reasoningProvider, aiConfigured } from '../lib/reasoning.js';

// Step 4 slice 3: BrandIdentity as a first-class, persisted entity. Loads the
// project's identities and derives new ones from moodboards via
// BrandIdentityEngine.synthesize (AI voice/hooks when a Mistral key is present).
export function useIdentity() {
  const [identities, setIdentities] = useState<BrandIdentity[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeriving, setIsDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await entityStore.list<BrandIdentity>('identity', getActiveWorkspaceId());
        if (!cancelled) {
          setIdentities(list);
          setActiveId(list[0]?.id ?? null);
        }
      } catch (err) {
        console.warn('Failed to load identities:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const derive = useCallback(async (moodboards: Moodboard[], name?: string): Promise<BrandIdentity | null> => {
    if (moodboards.length === 0) { setError('Keine Moodboards zum Ableiten vorhanden.'); return null; }
    setIsDeriving(true);
    setError(null);
    try {
      const partial = await BrandIdentityEngine.synthesize(
        moodboards,
        aiConfigured() ? { reasoning: reasoningProvider } : {},
      );
      const now = new Date();
      const identity: BrandIdentity = {
        id: `identity-${now.getTime()}`,
        workspaceId: getActiveWorkspaceId(),
        type: 'identity',
        title: name || `${moodboards[0].client || 'Brand'} Identity`,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        colors: partial.colors ?? [],
        typography: partial.typography ?? {},
        voice: partial.voice ?? { doList: [], dontList: [] },
        hooks: partial.hooks ?? [],
        moodboardIds: partial.moodboardIds ?? moodboards.map(m => m.id),
      };
      await entityStore.upsert(identity);
      // Provenance: identity —derived_from→ each source moodboard.
      for (const mb of moodboards) {
        await entityStore.link(identity.id, mb.id, 'derived_from');
      }
      setIdentities(prev => [...prev.filter(i => i.id !== identity.id), identity]);
      setActiveId(identity.id);
      return identity;
    } catch (e: any) {
      setError(e?.message ?? 'Ableitung fehlgeschlagen');
      return null;
    } finally {
      setIsDeriving(false);
    }
  }, []);

  const activeIdentity = identities.find(i => i.id === activeId) ?? identities[0] ?? null;

  return { identities, activeIdentity, setActiveId, derive, isLoading, isDeriving, error };
}

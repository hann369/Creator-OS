import { useState, useCallback } from 'react';
import type { BrandIdentity, Moodboard } from '@pronoia/domain';
import { BrandIdentityEngine } from '@pronoia/identity';
import { entityStore } from '../lib/entityStore.js';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { reasoningProvider, aiConfigured } from '../lib/reasoning.js';
import { identities as identityStore } from '../store/identities.js';

// Step 4 slice 3: BrandIdentity as a first-class, persisted entity. Loads the
// project's identities and derives new ones from moodboards via
// BrandIdentityEngine.synthesize (AI voice/hooks when a Mistral key is present).
//
// Reads the shared identity store, so an identity re-ranked by the learning loop
// (runIdentityLearning) shows up here without a reload.
export function useIdentity() {
  const identities = identityStore.useItems();
  const isLoading = !identityStore.useLoaded();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDeriving, setIsDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      identityStore.add(identity);
      // Provenance: identity —derived_from→ each source moodboard.
      for (const mb of moodboards) {
        await entityStore.link(identity.id, mb.id, 'derived_from');
      }
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

import type { BrandIdentity, ContentPipeline } from '@pronoia/domain';
import { BrandIdentityEngine } from '@pronoia/identity';
import { entityStore } from './entityStore.js';
import { identities as identityStore } from '../store/identities.js';

// Fires the learning loop: attribute the given cards' performance back onto every
// identity in the project and persist any whose hooks got re-ranked. Idempotent —
// only upserts when something actually changed, so it's safe to call on every
// metrics update.
//
// Reads and writes the shared identity store rather than the DB directly, so a
// re-ranked identity reaches a mounted IdentityView without a reload.
export async function runIdentityLearning(cards: ContentPipeline[]): Promise<BrandIdentity[]> {
  const [, relationships] = await Promise.all([
    identityStore.load(),
    entityStore.loadAll(),
  ]);
  const identities = identityStore.getAll();
  if (identities.length === 0) return [];

  const updated: BrandIdentity[] = [];
  for (const identity of identities) {
    const next = BrandIdentityEngine.learn({ identity, cards, relationships });
    if (JSON.stringify(next.hooks) !== JSON.stringify(identity.hooks)) {
      identityStore.add(next);
      updated.push(next);
    }
  }
  return updated;
}

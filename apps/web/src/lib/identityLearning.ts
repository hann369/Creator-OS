import type { BrandIdentity, ContentPipeline } from '@pronoia/domain';
import { BrandIdentityEngine } from '@pronoia/identity';
import { entityStore } from './entityStore.js';
import { getActiveWorkspaceId } from './workspace.js';

// Fires the learning loop: attribute the given cards' performance back onto every
// identity in the project and persist any whose hooks got re-ranked. Idempotent —
// only upserts when something actually changed, so it's safe to call on every
// metrics update.
export async function runIdentityLearning(cards: ContentPipeline[]): Promise<BrandIdentity[]> {
  const ws = getActiveWorkspaceId();
  const [identities, relationships] = await Promise.all([
    entityStore.list<BrandIdentity>('identity', ws),
    entityStore.loadAll(),
  ]);
  if (identities.length === 0) return [];

  const updated: BrandIdentity[] = [];
  for (const identity of identities) {
    const next = BrandIdentityEngine.learn({ identity, cards, relationships });
    if (JSON.stringify(next.hooks) !== JSON.stringify(identity.hooks)) {
      await entityStore.upsert(next);
      updated.push(next);
    }
  }
  return updated;
}

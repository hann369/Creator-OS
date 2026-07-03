import type { BrandIdentity, ContentPipeline, ContentMetrics, Relationship } from '@pronoia/domain';

// ─────────────────────────────────────────────────────────────────────────────
// The learning loop (Step 4, slice 2) — PURE.
//
// Closes the moat: attribute published-content performance back to the identity
// elements that shaped it, then re-rank those elements so future defaults are
// data-driven.
//
//   card —styled_by→ identity   (which identity styled which piece)
//   card.metrics                (how that piece performed)
//     → re-rank identity.hooks by average performance of the pieces using them
//
// Cold-start safe: with no attributed metrics, the identity is returned unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export interface IdentityLearningInput {
  identity: BrandIdentity;
  /** Published cards (those carrying `metrics`). */
  cards: ContentPipeline[];
  /** The relationship graph (needs `styled_by` edges: card → identity). */
  relationships: Relationship[];
}

/** Normalised performance signal for one piece of content (higher = better). */
function performanceScore(m: ContentMetrics): number {
  return (m.viralScore ?? 0)
    + (m.clickThroughRate ?? 0) * 10   // CTR is 0..1 → weight to a comparable range
    + (m.subscriberGain ?? 0) / 100;   // dampen raw subscriber counts
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const key = it.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function learnIdentity(input: IdentityLearningInput): BrandIdentity {
  const { identity, cards, relationships } = input;

  // Which cards did this identity shape? Two attribution paths, direction-agnostic:
  //   • direct:  card —styled_by→ identity  (domain-intended)
  //   • 2-hop:   card —styled_by— moodboard  where the moodboard feeds this identity
  //              (the app models styled_by between cards and moodboards)
  const moodboardIds = new Set(identity.moodboardIds);
  const attributedCardIds = new Set<string>();
  for (const r of relationships) {
    if (r.type !== 'styled_by') continue;
    if (r.targetId === identity.id) attributedCardIds.add(r.sourceId);
    else if (r.sourceId === identity.id) attributedCardIds.add(r.targetId);
    else if (moodboardIds.has(r.sourceId)) attributedCardIds.add(r.targetId);
    else if (moodboardIds.has(r.targetId)) attributedCardIds.add(r.sourceId);
  }

  const attributed = cards.filter(c => attributedCardIds.has(c.id) && c.metrics);
  if (attributed.length === 0) return identity; // nothing measured yet → no change

  // Average performance per hook used by the attributed pieces.
  const hookPerf = new Map<string, { total: number; n: number }>();
  for (const card of attributed) {
    const hook = card.hook?.trim();
    if (!hook || !card.metrics) continue;
    const s = performanceScore(card.metrics);
    const e = hookPerf.get(hook);
    if (e) { e.total += s; e.n += 1; }
    else hookPerf.set(hook, { total: s, n: 1 });
  }

  // Best-performing hooks first, then any existing identity hooks not yet seen.
  const learnedHooks = [...hookPerf.entries()]
    .sort((a, b) => (b[1].total / b[1].n) - (a[1].total / a[1].n))
    .map(([hook]) => hook);

  const hooks = dedupe([...learnedHooks, ...identity.hooks]);

  return { ...identity, hooks, updatedAt: new Date() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Library (Phase 5).
//
// Reusable, closed vocabularies. The AI is instructed to classify into these
// instead of inventing a new label every time. classify() snaps any free-text
// label the model returns to the nearest library entry, so downstream filters
// (Phase 8) always operate over a stable set.
// ─────────────────────────────────────────────────────────────────────────────

export const HOOK_PATTERNS = [
  'Nobody talks about',
  'Stop doing this',
  'The biggest mistake',
  'I tested',
  'The truth about',
  'What if',
  'Question',
  'Bold claim',
  'Direct address',
  'Story open',
] as const;

export const SEED_PATTERNS = [
  'Breakdown/Explainer',
  'Case Study',
  'Problem Solution',
  'Common Mistake/Trap',
  'Tutorial',
  'Listicle',
  'Scenario',
  'A vs B (vs C) Comparison',
  'Q&A',
  'Ranking/Rating/Tier List',
  'Levels',
  'Reaction',
  'Skit/Humor',
  'Hero\'s Journey',
  'Personal Learning/Epiphany',
  'Day In The Life',
  'Personal Update',
  'About Me',
  'Episode Series/Social Show',
  'Challenge',
] as const;

export const MECHANISMS = [
  'Curiosity',
  'Fear',
  'Hope',
  'Authority',
  'Novelty',
  'Social Proof',
  'Urgency',
  'Visual Demonstration',
  'Contrarian',
] as const;

export const STORY_STRUCTURES = [
  'Problem',
  'Problem → Solution',
  'Transformation',
  'Hero Journey',
  'Experiment',
  'Countdown',
  'Comparison',
] as const;

export type HookPattern = (typeof HOOK_PATTERNS)[number];
export type SeedPattern = (typeof SEED_PATTERNS)[number];
export type Mechanism = (typeof MECHANISMS)[number];
export type StoryStructure = (typeof STORY_STRUCTURES)[number];

export type PatternLibrary = readonly string[];

// Lightweight token-overlap + substring scorer. Deterministic, dependency-free.
function score(candidate: string, entry: string): number {
  const a = candidate.toLowerCase().trim();
  const b = entry.toLowerCase().trim();
  if (!a) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const at = new Set(a.split(/[^a-z0-9]+/).filter(Boolean));
  const bt = new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let overlap = 0;
  for (const t of at) if (bt.has(t)) overlap++;
  return overlap / Math.max(at.size, bt.size);
}

/**
 * Snap a free-text label onto the nearest library entry.
 * Returns the closest entry, or `fallback` (default: first entry) if nothing
 * clears the confidence threshold.
 */
export function classify<T extends PatternLibrary>(
  freeText: string,
  library: T,
  opts: { threshold?: number; fallback?: T[number] } = {},
): T[number] {
  const threshold = opts.threshold ?? 0.34;
  const fallback = opts.fallback ?? library[0];

  let best = fallback;
  let bestScore = 0;
  for (const entry of library) {
    const s = score(freeText, entry);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
    }
  }
  return bestScore >= threshold ? best : fallback;
}

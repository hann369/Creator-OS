import type { ContentEntry, CreatorProfile, OutlierScore, OutlierLabel, Statistics } from './content-model.js';

// ─────────────────────────────────────────────────────────────────────────────
// Outlier Detection Engine (Phase 6).
//
// Per-creator baselines drive an OutlierScore for every video. A creator with
// no baseline yet yields label "Normal" and score 1 (nothing to compare to).
// ─────────────────────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Recompute a creator's baseline profile from a sample of their entries. */
export function buildCreatorProfile(
  creatorId: string,
  entries: Pick<ContentEntry, 'creator' | 'platform' | 'statistics' | 'publishedAt' | 'analysis'>[],
  workspaceId: string,
): CreatorProfile {
  const views = entries.map((e) => e.statistics.views);
  const likes = entries.map((e) => e.statistics.likes);

  // Posting frequency: posts per week across the observed span.
  const dates = entries.map((e) => e.publishedAt?.getTime()).filter((t): t is number => !!t).sort((a, b) => a - b);
  let postingFrequencyPerWeek = 0;
  if (dates.length >= 2) {
    const spanWeeks = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24 * 7);
    postingFrequencyPerWeek = spanWeeks > 0 ? entries.length / spanWeeks : 0;
  }

  const topicDistribution: Record<string, number> = {};
  for (const e of entries) {
    const t = e.analysis?.topic;
    if (t) topicDistribution[t] = (topicDistribution[t] ?? 0) + 1;
  }

  return {
    creatorId,
    platform: entries[0]?.platform ?? 'youtube',
    creator: entries[0]?.creator ?? creatorId,
    averageViews: mean(views),
    medianViews: median(views),
    averageLikes: mean(likes),
    postingFrequencyPerWeek,
    topicDistribution,
    sampleSize: entries.length,
    workspaceId,
    updatedAt: new Date(),
  };
}

function labelFor(outlierScore: number): OutlierLabel {
  if (outlierScore >= 5) return 'Extreme Outlier';
  if (outlierScore >= 2) return 'High Performer';
  return 'Normal';
}

export function engagementScore(s: Statistics): number {
  if (!s.views) return 0;
  return Number(((s.likes + s.comments + s.shares) / s.views).toFixed(4));
}

/**
 * Compute an OutlierScore for one entry against a creator baseline.
 * If no baseline (or medianViews == 0), score defaults to 1 / "Normal".
 */
export function computeOutlier(
  stats: Statistics,
  publishedAt: Date | undefined,
  profile: CreatorProfile | null,
): OutlierScore {
  const medianViews = profile?.medianViews ?? 0;
  const outlierScore = medianViews > 0 ? Number((stats.views / medianViews).toFixed(2)) : 1;

  const hoursSince = publishedAt ? Math.max(1, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60)) : 24;
  const velocityScore = Number((stats.views / hoursSince).toFixed(2));

  // Retention proxy: comments relative to likes hints at deeper engagement.
  const retentionProxy = stats.likes > 0 ? Number(Math.min(1, stats.comments / stats.likes).toFixed(4)) : 0;

  return {
    outlierScore,
    engagementScore: engagementScore(stats),
    velocityScore,
    retentionProxy,
    label: labelFor(outlierScore),
  };
}

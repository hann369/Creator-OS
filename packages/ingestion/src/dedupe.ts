import { Embedder } from '@pronoia/brain';
import type { ContentEntry } from './content-model.js';

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate Detection (Phase 10).
//
// Primary guarantee is exact: canonicalUrl (and videoId within a platform) are
// stable identifiers, so they catch re-imports reliably. Embedding similarity is
// a SECONDARY, best-effort signal — note the current Embedder is a mock (random
// vectors), so semantic dedupe only becomes meaningful once a real embedder is
// wired. The API is written so that swap requires no change here.
// ─────────────────────────────────────────────────────────────────────────────

export interface DuplicateMatch {
  isDuplicate: boolean;
  matchId?: string;
  reason?: 'canonical-url' | 'video-id' | 'embedding';
  similarity?: number;
}

export interface DedupeCandidate {
  id: string;
  platform: ContentEntry['platform'];
  canonicalUrl: string;
  videoId?: string | null;
  embedding?: number[];
}

export function findDuplicate(
  incoming: DedupeCandidate,
  existing: DedupeCandidate[],
  opts: { embeddingThreshold?: number } = {},
): DuplicateMatch {
  const threshold = opts.embeddingThreshold ?? 0.95;

  for (const e of existing) {
    if (e.canonicalUrl && e.canonicalUrl === incoming.canonicalUrl) {
      return { isDuplicate: true, matchId: e.id, reason: 'canonical-url' };
    }
    if (incoming.videoId && e.platform === incoming.platform && e.videoId === incoming.videoId) {
      return { isDuplicate: true, matchId: e.id, reason: 'video-id' };
    }
  }

  if (incoming.embedding && incoming.embedding.length) {
    for (const e of existing) {
      if (!e.embedding?.length) continue;
      if (e.embedding.length !== incoming.embedding.length) continue;
      const sim = Embedder.cosineSimilarity(incoming.embedding, e.embedding);
      if (sim >= threshold) {
        return { isDuplicate: true, matchId: e.id, reason: 'embedding', similarity: sim };
      }
    }
  }

  return { isDuplicate: false };
}

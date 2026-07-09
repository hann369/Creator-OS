import type { ResolvedSource } from '../resolver.js';
import type { Statistics, ContentComment, ContentMetadataBlock } from '../content-model.js';

// ─────────────────────────────────────────────────────────────────────────────
// Provider Architecture (Phase 2).
//
// Every platform implements the SAME contract. The pipeline never knows which
// platform it is talking to. New platforms (Phase 14) implement ContentProvider
// and register — nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderMetadata {
  creator: string;
  creatorId: string;
  title: string;
  description: string;
  publishedAt?: Date;
  duration?: number;
  language?: string;
  thumbnail?: string;
  metadata: ContentMetadataBlock;
}

export interface ContentProvider {
  /** Whether this provider handles the given resolved source. */
  canHandle(source: ResolvedSource): boolean;
  fetchMetadata(source: ResolvedSource): Promise<ProviderMetadata>;
  fetchTranscript(source: ResolvedSource): Promise<string>;
  fetchComments(source: ResolvedSource): Promise<ContentComment[]>;
  fetchThumbnail(source: ResolvedSource): Promise<string | undefined>;
  fetchStatistics(source: ResolvedSource): Promise<Statistics>;
}

// Bundle every provider call resolves to, before AI enrichment.
export interface FetchedContent {
  metadata: ProviderMetadata;
  transcript: string;
  comments: ContentComment[];
  thumbnail?: string;
  statistics: Statistics;
}

/** Convenience: run all provider calls and assemble a FetchedContent bundle. */
export async function fetchAll(
  provider: ContentProvider,
  source: ResolvedSource,
): Promise<FetchedContent> {
  const [metadata, transcript, comments, thumbnail, statistics] = await Promise.all([
    provider.fetchMetadata(source),
    provider.fetchTranscript(source),
    provider.fetchComments(source),
    provider.fetchThumbnail(source),
    provider.fetchStatistics(source),
  ]);
  return { metadata, transcript, comments, thumbnail: thumbnail ?? metadata.thumbnail, statistics };
}

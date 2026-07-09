import type { ChatProvider } from '@pronoia/ai';
import type { GraphRepository } from '@pronoia/services';
import { resolveSource, type ResolvedSource } from './resolver.js';
import { fetchAll, type ContentProvider } from './providers/types.js';
import type { ContentEntry, IngestionStatus } from './content-model.js';
import { analyzeContent } from './analysis.js';
import { computeOutlier } from './outliers.js';
import { findDuplicate } from './dedupe.js';
import { projectAnalysis, persistProjection } from './graph-projection.js';
import type { ContentStore, CreatorProfileStore } from './stores.js';

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion Orchestrator (Phases 9 + 12).
//
// Ties the stages together with a persisted status state machine:
//   queued → resolving → fetching → transcribing → reasoning → graph_linking → completed
// Each stage updates content_entries.status so the UI can show progress. Stages
// are ordered and the entry row is created up-front, so a failed run is
// resumable (re-run picks up from the persisted entry).
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineDeps {
  provider: ContentProvider;   // resolved for the source's platform (see selectProvider)
  ai: ChatProvider;
  /** Real embedding function (e.g. Mistral). Injected so the package stays provider-agnostic. */
  embed: (text: string) => Promise<number[]>;
  graph: GraphRepository;
  content: ContentStore;
  creators: CreatorProfileStore;
  onStatus?: (id: string, status: IngestionStatus) => void;
}

function newId(source: ResolvedSource): string {
  return `content-${source.platform}-${source.videoId ?? Date.now()}`;
}

/** Deterministic content id for a URL — lets callers know the id before enqueueing. */
export function plannedContentId(rawUrl: string): string {
  return newId(resolveSource(rawUrl));
}

export interface IngestResult {
  entryId: string;
  status: IngestionStatus;
  duplicateOf?: string;
}

/** Pick the provider that handles a resolved source from a registry. */
export function selectProvider(providers: ContentProvider[], source: ResolvedSource): ContentProvider {
  const p = providers.find((x) => x.canHandle(source));
  if (!p) throw new Error(`No provider for platform: ${source.platform}`);
  return p;
}

export async function runIngestion(rawUrl: string, workspaceId: string, deps: PipelineDeps): Promise<IngestResult> {
  const { provider, ai, embed, graph, content, creators, onStatus } = deps;
  const now = new Date();

  // ── resolving ──────────────────────────────────────────────────────────────
  const source = resolveSource(rawUrl);
  const id = newId(source);

  // Dedupe before doing any expensive work.
  const candidates = await content.listDedupeCandidates(workspaceId);
  const dup = findDuplicate(
    { id, platform: source.platform, canonicalUrl: source.canonicalUrl, videoId: source.videoId },
    candidates,
  );
  if (dup.isDuplicate) {
    return { entryId: dup.matchId!, status: 'completed', duplicateOf: dup.matchId };
  }

  const entry: ContentEntry = {
    id,
    platform: source.platform,
    creator: source.creator ?? '',
    creatorId: source.creatorId ?? source.creator ?? '',
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    mediaType: source.mediaType,
    title: '',
    description: '',
    transcript: '',
    comments: [],
    statistics: { views: 0, likes: 0, comments: 0, shares: 0 },
    metadata: { hashtags: [], mentions: [] },
    status: 'resolving',
    workspaceId,
    createdAt: now,
    updatedAt: now,
  };
  await content.create(entry);
  const advance = async (s: IngestionStatus, err?: string) => {
    await content.setStatus(id, s, err);
    onStatus?.(id, s);
  };
  onStatus?.(id, 'resolving');

  try {
    // ── fetching ───────────────────────────────────────────────────────────
    await advance('fetching');
    const fetched = await fetchAll(provider, source);
    entry.creator = fetched.metadata.creator || entry.creator;
    entry.creatorId = fetched.metadata.creatorId || entry.creatorId || entry.creator;
    entry.title = fetched.metadata.title;
    entry.description = fetched.metadata.description;
    entry.publishedAt = fetched.metadata.publishedAt;
    entry.duration = fetched.metadata.duration;
    entry.language = fetched.metadata.language;
    entry.thumbnail = fetched.thumbnail;
    entry.metadata = fetched.metadata.metadata;
    entry.comments = fetched.comments;
    entry.statistics = fetched.statistics;

    // ── transcribing ─────────────────────────────────────────────────────────
    await advance('transcribing');
    entry.transcript = fetched.transcript;

    // ── reasoning (AI structured analysis) ─────────────────────────────────────
    await advance('reasoning');
    entry.analysis = await analyzeContent(entry, ai);

    // Outlier score against the creator baseline.
    const profile = await creators.find(entry.creatorId, workspaceId);
    entry.outlier = computeOutlier(entry.statistics, entry.publishedAt, profile);

    // Embedding on the best available text (transcript → description → title).
    entry.embedding = await embed(entry.transcript || entry.description || entry.title);

    await content.update(id, {
      creator: entry.creator,
      creatorId: entry.creatorId,
      title: entry.title,
      description: entry.description,
      publishedAt: entry.publishedAt,
      duration: entry.duration,
      language: entry.language,
      thumbnail: entry.thumbnail,
      metadata: entry.metadata,
      comments: entry.comments,
      statistics: entry.statistics,
      transcript: entry.transcript,
      analysis: entry.analysis,
      outlier: entry.outlier,
      embedding: entry.embedding,
    });

    // ── graph_linking ──────────────────────────────────────────────────────────
    await advance('graph_linking');
    const projection = projectAnalysis(entry, entry.analysis);
    await persistProjection(projection, graph);

    // ── completed ──────────────────────────────────────────────────────────────
    await advance('completed');
    return { entryId: id, status: 'completed' };
  } catch (err: any) {
    await advance('failed', err?.message ?? String(err));
    throw err;
  }
}

import {
  runIngestion,
  selectProvider,
  YoutubeProvider,
  InstagramProvider,
  TikTokProvider,
  TwitterProvider,
  resolveSource,
  plannedContentId,
  type ContentProvider,
  type IngestionStatus,
  type ContentEntry,
} from '@pronoia/ingestion';
import type { ChatProvider, EmbeddingProvider } from '@pronoia/ai';
import { resolveProvider } from '@pronoia/ai';
import { makeContentStore, makeCreatorProfileStore, makeGraphRepository } from '../ingestionStores.js';
import { supabaseAdmin } from '../supabase.js';

// In-process ingestion queue (Phase 12). Mirrors the embeddingQueue worker
// pattern: jobs run one at a time off the event loop so the HTTP handler can
// return immediately (202) while the pipeline advances the persisted status.
// The UI polls GET /library/:id for progress.
//
// Note: on serverless this fire-and-forget model only survives while the
// function instance is warm; a durable queue (pgmq / a worker dyno) is the
// production upgrade. For a long-running Node process it works as-is.

interface Job {
  rawUrl: string;
  workspaceId: string;
  ownerId: string;
}

const queue: Job[] = [];
let running = false;

function buildProviders(): ContentProvider[] {
  return [new YoutubeProvider(), new InstagramProvider(), new TikTokProvider(), new TwitterProvider()];
}

export async function processJob(job: Job): Promise<void> {
  const source = resolveSource(job.rawUrl);
  const provider = selectProvider(buildProviders(), source);
  // Live Mistral covers chat AND embeddings; one key, one instance.
  const mistral = resolveProvider('mistral', { mistralKey: process.env.MISTRAL_API_KEY });
  await runIngestion(job.rawUrl, job.workspaceId, {
    provider,
    ai: mistral as unknown as ChatProvider,
    embed: (text: string) => (mistral as unknown as EmbeddingProvider).generateEmbedding(text),
    graph: makeGraphRepository(job.ownerId),
    content: makeContentStore(job.ownerId),
    creators: makeCreatorProfileStore(job.ownerId),
    onStatus: (id, status: IngestionStatus) => console.log(`[ingestion] ${id} → ${status}`),
  });
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        await processJob(job);
      } catch (err) {
        console.error('[ingestion] job failed:', (err as Error)?.message ?? err);
      }
    }
  } finally {
    running = false;
  }
}

export async function enqueueIngestion(job: Job): Promise<string> {
  const source = resolveSource(job.rawUrl);
  const id = plannedContentId(job.rawUrl);
  const contentStore = makeContentStore(job.ownerId);

  try {
    const existing = await contentStore.findById(id);
    if (!existing) {
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
        status: 'queued',
        workspaceId: job.workspaceId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await contentStore.create(entry);
    } else if (existing.status === 'failed') {
      await contentStore.setStatus(id, 'queued');
    }
  } catch (dbErr) {
    console.error(`[ingestion queue] failed to persist/update queued status for ${id}:`, dbErr);
  }

  if (process.env.VERCEL) {
    await processJob(job);
  } else {
    const alreadyQueued = queue.some(
      (j) => j.rawUrl === job.rawUrl && j.workspaceId === job.workspaceId && j.ownerId === job.ownerId
    );
    if (!alreadyQueued) {
      queue.push(job);
    }
    void drain();
  }

  return id;
}

export async function bootstrapQueue(): Promise<void> {
  if (process.env.VERCEL) return;

  try {
    const { data, error } = await supabaseAdmin
      .from('content_entries')
      .select('url, workspace_id, owner_id')
      .in('status', ['queued', 'resolving']);

    if (error) {
      console.error('[ingestion queue] failed to fetch pending jobs from database:', error.message);
      return;
    }

    if (data && data.length > 0) {
      console.log(`[ingestion queue] Bootstrapping ${data.length} pending/interrupted jobs from database...`);
      for (const row of data) {
        void enqueueIngestion({
          rawUrl: row.url,
          workspaceId: row.workspace_id,
          ownerId: row.owner_id,
        });
      }
    }
  } catch (err) {
    console.error('[ingestion queue] error during bootstrapping:', err);
  }
}

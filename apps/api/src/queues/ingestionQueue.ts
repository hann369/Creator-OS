import {
  runIngestion,
  selectProvider,
  YoutubeProvider,
  InstagramProvider,
  resolveSource,
  type ContentProvider,
  type IngestionStatus,
} from '@pronoia/ingestion';
import type { ChatProvider, EmbeddingProvider } from '@pronoia/ai';
import { resolveProvider } from '@pronoia/ai';
import { makeContentStore, makeCreatorProfileStore, makeGraphRepository } from '../ingestionStores.js';

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
  return [new YoutubeProvider(), new InstagramProvider()];
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
    graph: makeGraphRepository(),
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

export function enqueueIngestion(job: Job): void {
  queue.push(job);
  void drain();
}

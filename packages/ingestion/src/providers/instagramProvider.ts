import type { ResolvedSource } from '../resolver.js';
import type { Statistics, ContentComment, ContentMetadataBlock } from '../content-model.js';
import type { ContentProvider, ProviderMetadata } from './types.js';
import { SupadataClient } from './supadata.js';

// Instagram provider — backed by Supadata (metadata + transcript). Instagram has
// no keyless path (gates datacenter IPs even with cookies), so this is the only
// reliable route. Supadata is used ONLY here — YouTube keeps its own transcript
// path — to keep the small monthly quota spent on reels.
//
// Env: SUPADATA_API_KEY. Without it the provider throws a clear error so the
// pipeline marks the entry failed with an actionable message.
export interface InstagramProviderConfig {
  apiKey?: string; // SUPADATA_API_KEY
}

export class InstagramProvider implements ContentProvider {
  private client: SupadataClient | null;
  private cache = new Map<string, Promise<Awaited<ReturnType<SupadataClient['metadata']>>>>();

  constructor(cfg: InstagramProviderConfig = {}) {
    const key = cfg.apiKey ?? process.env.SUPADATA_API_KEY;
    this.client = key ? new SupadataClient(key) : null;
  }

  canHandle(source: ResolvedSource): boolean {
    return source.platform === 'instagram';
  }

  private require(): SupadataClient {
    if (!this.client) throw new Error('Instagram ingestion needs SUPADATA_API_KEY (Supadata is the reel data source).');
    return this.client;
  }

  private meta(source: ResolvedSource) {
    const id = source.videoId ?? source.canonicalUrl;
    if (!this.cache.has(id)) this.cache.set(id, this.require().metadata(source.canonicalUrl));
    return this.cache.get(id)!;
  }

  async fetchMetadata(source: ResolvedSource): Promise<ProviderMetadata> {
    const m = await this.meta(source);
    const desc = m.description ?? '';
    const hashtags = [...desc.matchAll(/#(\w+)/g)].map((x) => `#${x[1]}`).slice(0, 30);
    const mentions = [...desc.matchAll(/@([\w.]+)/g)].map((x) => `@${x[1]}`).slice(0, 30);
    const metadata: ContentMetadataBlock = { hashtags, mentions };
    return {
      creator: m.author.username ?? source.creator ?? '',
      creatorId: m.author.username ?? source.creator ?? '',
      title: desc ? desc.split('\n')[0].slice(0, 100) : `Instagram Reel ${m.id}`,
      description: desc,
      duration: m.duration,
      thumbnail: m.thumbnail,
      metadata,
    };
  }

  async fetchTranscript(source: ResolvedSource): Promise<string> {
    return this.require().transcript(source.canonicalUrl);
  }

  async fetchComments(): Promise<ContentComment[]> {
    return []; // Supadata metadata gives comment COUNT, not threads
  }

  async fetchThumbnail(source: ResolvedSource): Promise<string | undefined> {
    return (await this.meta(source)).thumbnail;
  }

  async fetchStatistics(source: ResolvedSource): Promise<Statistics> {
    const m = await this.meta(source);
    return {
      views: m.stats.views ?? 0,
      likes: m.stats.likes ?? 0,
      comments: m.stats.comments ?? 0,
      shares: m.stats.shares ?? 0,
    };
  }
}

import type { ResolvedSource } from '../resolver.js';
import type { Statistics, ContentComment, ContentMetadataBlock } from '../content-model.js';
import type { ContentProvider, ProviderMetadata } from './types.js';
import { type TranscriptSource, HttpTranscriptSource, TranscriptCredentialsMissingError } from './transcriptSource.js';
import { fetchWatchData, fetchTranscriptFromTracks, type WatchData } from './youtubeFetch.js';

// Real YouTube provider — keyless. Metadata, view count, description, duration,
// keywords and thumbnail come from the InnerTube WEB player (no API key).
// Transcript is a best-effort keyless caption fetch, falling back to an injected
// third-party vendor when one is configured. Likes/comments need the Data API
// key (env-gated), so without it they are 0 / [] — never faked.
export interface YoutubeProviderConfig {
  transcriptSource?: TranscriptSource;
  dataApiKey?: string; // YOUTUBE_API_KEY (optional enrichment: likes, comments)
}

export class YoutubeProvider implements ContentProvider {
  private transcriptSource: TranscriptSource;
  private dataApiKey?: string;
  private cache = new Map<string, Promise<WatchData>>();

  constructor(cfg: YoutubeProviderConfig = {}) {
    this.dataApiKey = cfg.dataApiKey ?? process.env.YOUTUBE_API_KEY;
    this.transcriptSource =
      cfg.transcriptSource ??
      new HttpTranscriptSource({
        endpoint: process.env.TRANSCRIPT_API_URL,
        // The jaypaun007 public API doesn't require a real Bearer token. We read
        // TRANSCRIPT_API_KEY from env; if absent, fall back to a sentinel so the
        // Authorization header is present but harmless for keyless APIs.
        apiKey: process.env.TRANSCRIPT_API_KEY ?? 'enabled',
        envVar: 'TRANSCRIPT_API_URL',
        // jaypaun007 uses { url: "..." } which is the default urlBodyKey — no override needed.
        // Set TRANSCRIPT_URL_BODY_KEY in env only if your self-hosted vendor uses a different key.
        urlBodyKey: process.env.TRANSCRIPT_URL_BODY_KEY ?? 'url',
      });
  }

  canHandle(source: ResolvedSource): boolean {
    return source.platform === 'youtube';
  }

  // One InnerTube call per video, shared across the five provider methods.
  private watch(source: ResolvedSource): Promise<WatchData> {
    const id = source.videoId ?? '';
    if (!this.cache.has(id)) this.cache.set(id, fetchWatchData(id));
    return this.cache.get(id)!;
  }

  async fetchMetadata(source: ResolvedSource): Promise<ProviderMetadata> {
    const w = await this.watch(source);
    const hashtags = [...w.description.matchAll(/#(\w+)/g)].map((m) => `#${m[1]}`).slice(0, 30);
    const mentions = [...w.description.matchAll(/@([\w.]+)/g)].map((m) => `@${m[1]}`).slice(0, 30);
    const metadata: ContentMetadataBlock = { hashtags, mentions, keywords: w.keywords };
    return {
      creator: w.author || source.creator || '',
      creatorId: w.channelId || source.creatorId || w.author || '',
      title: w.title,
      description: w.description,
      duration: w.lengthSeconds || undefined,
      language: undefined,
      thumbnail: w.thumbnail ?? (source.videoId ? `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg` : undefined),
      metadata,
    };
  }

  async fetchTranscript(source: ResolvedSource): Promise<string> {
    const w = await this.watch(source);
    const keyless = await fetchTranscriptFromTracks(w.captionTracks, source.videoId ?? undefined);
    if (keyless && !isGarbageTranscript(keyless)) return keyless;
    // Fall back to the configured vendor; if none is configured or it fails,
    // we return '' so the pipeline can still analyze title+description, and
    // the client-side fallback can backfill the transcript.
    try {
      const vendorTranscript = await this.transcriptSource.fetchTranscript(source);
      if (vendorTranscript && !isGarbageTranscript(vendorTranscript)) {
        return vendorTranscript;
      }
      return '';
    } catch (err) {
      console.warn(`[youtubeProvider] Transcript vendor fetch failed:`, (err as Error)?.message ?? err);
      return '';
    }
  }
  async fetchComments(source: ResolvedSource): Promise<ContentComment[]> {
    if (!this.dataApiKey) return [];
    const url =
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=20` +
      `&videoId=${encodeURIComponent(source.videoId ?? '')}&key=${this.dataApiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.items ?? []).map((it: any) => {
      const s = it.snippet?.topLevelComment?.snippet ?? {};
      return { author: s.authorDisplayName, text: s.textDisplay ?? '', likes: Number(s.likeCount ?? 0) };
    });
  }

  async fetchThumbnail(source: ResolvedSource): Promise<string | undefined> {
    const w = await this.watch(source);
    return w.thumbnail ?? (source.videoId ? `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg` : undefined);
  }

  async fetchStatistics(source: ResolvedSource): Promise<Statistics> {
    const w = await this.watch(source);
    const stats: Statistics = { views: w.viewCount, likes: 0, comments: 0, shares: 0 };
    if (this.dataApiKey) {
      // Optional real enrichment for likes/comments when a key is available.
      const url =
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(source.videoId ?? '')}` +
        `&key=${this.dataApiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const s = (await res.json()).items?.[0]?.statistics ?? {};
        stats.likes = Number(s.likeCount ?? 0);
        stats.comments = Number(s.commentCount ?? 0);
        if (s.viewCount) stats.views = Number(s.viewCount);
      }
    }
    return stats;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isGarbageTranscript(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // YouTube bot check/challenge signatures or JSON-like signature strings
  if (trimmed.includes('"$@1"') || trimmed.includes('1:null') || trimmed.startsWith('0:{"')) return true;
  if (trimmed.includes('window.parent.postMessage') || trimmed.includes('<script') || trimmed.includes('<!DOCTYPE')) return true;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return true;
  if (trimmed.length < 15) return true;
  return false;
}

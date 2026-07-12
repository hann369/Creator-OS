import type { ResolvedSource } from '../resolver.js';
import type { Statistics, ContentComment, ContentMetadataBlock } from '../content-model.js';
import type { ContentProvider, ProviderMetadata } from './types.js';

// TikTok provider.
//
// The canonical scraper `tiktok-scraper` (drawrowfly) can NOT be a dependency
// here: it pulls the native `canvas` module (node-gyp / Visual Studio build),
// which fails to install on stock Windows and CI, and its data path has been
// stale since 2021. So this provider uses TikTok's PUBLIC oEmbed endpoint —
// keyless, dependency-free and stable. It yields title, author and thumbnail; it
// does NOT expose engagement stats or a transcript (oEmbed carries neither), so
// those come back zeroed/empty, which the outlier scorer reads as an
// un-baselined video. Full stats would need an authenticated data API, exactly
// as Instagram uses Supadata.

interface TikTokOEmbed {
  title?: string;
  author_name?: string;       // display name, e.g. "TikTok" — NOT the @handle
  author_unique_id?: string;  // the @handle, but omitted by the live endpoint
  author_url?: string;        // https://www.tiktok.com/@handle — the reliable handle source
  thumbnail_url?: string;
}

function stripAt(handle: string | undefined | null): string | null {
  if (!handle) return null;
  return handle.replace(/^@/, '') || null;
}

export class TikTokProvider implements ContentProvider {
  private cache = new Map<string, Promise<TikTokOEmbed>>();

  canHandle(source: ResolvedSource): boolean {
    return source.platform === 'tiktok';
  }

  private oembed(source: ResolvedSource): Promise<TikTokOEmbed> {
    const url = source.canonicalUrl;
    if (!this.cache.has(url)) {
      this.cache.set(url, (async () => {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`TikTok oEmbed failed (${res.status}) for ${url}`);
        return (await res.json()) as TikTokOEmbed;
      })());
    }
    return this.cache.get(url)!;
  }

  async fetchMetadata(source: ResolvedSource): Promise<ProviderMetadata> {
    const o = await this.oembed(source);
    const title = o.title ?? '';
    const hashtags = [...title.matchAll(/#(\w+)/g)].map((x) => `#${x[1]}`).slice(0, 30);
    const mentions = [...title.matchAll(/@([\w.]+)/g)].map((x) => `@${x[1]}`).slice(0, 30);
    // Prefer the @handle: the URL (resolver) is most reliable, then author_url's
    // last path segment (@handle), then the omitted unique_id, and only last the
    // display name — author_name is "TikTok", not the handle.
    const handleFromUrl = o.author_url ? stripAt(o.author_url.split('/').filter(Boolean).pop()) : null;
    const creator = source.creator ?? stripAt(o.author_unique_id) ?? handleFromUrl ?? stripAt(o.author_name) ?? '';
    const metadata: ContentMetadataBlock = { hashtags, mentions };
    return {
      creator,
      creatorId: creator,
      title: title ? title.split('\n')[0].slice(0, 100) : `TikTok ${source.videoId ?? ''}`.trim(),
      description: title,
      thumbnail: o.thumbnail_url,
      metadata,
    };
  }

  async fetchTranscript(): Promise<string> {
    return ''; // oEmbed exposes no transcript
  }

  async fetchComments(): Promise<ContentComment[]> {
    return [];
  }

  async fetchThumbnail(source: ResolvedSource): Promise<string | undefined> {
    return (await this.oembed(source)).thumbnail_url;
  }

  async fetchStatistics(): Promise<Statistics> {
    return { views: 0, likes: 0, comments: 0, shares: 0 };
  }
}

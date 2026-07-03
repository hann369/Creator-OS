import type { ContentMetrics } from '@pronoia/domain';
import type { SocialPostMetric } from './social.js';

// Social-analytics ingest scaffold. The moat loop currently gets ContentMetrics
// by hand; this is the structure to pull them automatically from YouTube /
// Instagram. It is CREDENTIAL-FREE by design: without an API key the clients
// throw SocialCredentialsMissingError (a clean 501 upstream), so nothing calls a
// live API until keys are supplied. Wiring real fetch calls is a drop-in once
// credentials exist — the shapes below already match each platform's API.

export type SocialPlatform = 'youtube' | 'instagram';

export class SocialCredentialsMissingError extends Error {
  constructor(public platform: SocialPlatform, envVar: string) {
    super(`No credentials for ${platform}. Set ${envVar} to enable ingest.`);
    this.name = 'SocialCredentialsMissingError';
  }
}

export interface SocialIngestConfig {
  youtubeApiKey?: string;      // Google API key, YouTube Data API v3
  instagramAccessToken?: string; // Meta Graph API long-lived token
}

// ─── viralScore: the same formula the domain documents on ContentMetrics ─────
export function computeViralScore(m: { likes: number; comments: number; shares: number; views: number }): number {
  if (!m.views) return 0;
  const raw = (m.shares * 3 + m.comments * 2 + m.likes) / m.views;
  return Math.min(10, Number((raw * 10).toFixed(2)));
}

/** Map a raw platform post metric onto the domain ContentMetrics shape. */
export function mapPostToMetrics(post: SocialPostMetric, subscriberGain = 0): ContentMetrics {
  const views = post.views ?? 0;
  const shares = post.shares ?? 0;
  return {
    views,
    watchTimeMinutes: 0,          // not available from the basic list endpoints
    avgViewDurationSeconds: 0,
    clickThroughRate: 0,          // needs the analytics (owner) API — future
    likes: post.likes,
    comments: post.comments,
    shares,
    subscriberGain,
    viralScore: computeViralScore({ likes: post.likes, comments: post.comments, shares, views }),
  };
}

// ─── YouTube Data API v3 (env-gated) ─────────────────────────────────────────
// Real endpoint shapes documented inline so wiring is a drop-in. Until a key is
// present, fetchVideoMetrics throws — no live call is made.
export class YouTubeDataClient {
  constructor(private apiKey?: string) {}

  async fetchVideoMetrics(videoId: string): Promise<SocialPostMetric> {
    if (!this.apiKey) throw new SocialCredentialsMissingError('youtube', 'YOUTUBE_API_KEY');
    // Drop-in when a key exists:
    //   GET https://www.googleapis.com/youtube/v3/videos
    //       ?part=statistics,snippet&id={videoId}&key={apiKey}
    //   → items[0].statistics { viewCount, likeCount, commentCount }
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${encodeURIComponent(videoId)}&key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) throw new Error(`YouTube: video ${videoId} not found`);
    const s = item.statistics ?? {};
    return {
      id: videoId,
      title: item.snippet?.title,
      likes: Number(s.likeCount ?? 0),
      comments: Number(s.commentCount ?? 0),
      views: Number(s.viewCount ?? 0),
      publishedAt: new Date(item.snippet?.publishedAt ?? Date.now()),
    };
  }
}

// ─── Instagram Graph API (env-gated) ─────────────────────────────────────────
export class InstagramGraphClient {
  constructor(private accessToken?: string) {}

  async fetchMediaMetrics(mediaId: string): Promise<SocialPostMetric> {
    if (!this.accessToken) throw new SocialCredentialsMissingError('instagram', 'INSTAGRAM_ACCESS_TOKEN');
    // Drop-in when a token exists:
    //   GET https://graph.facebook.com/v21.0/{mediaId}
    //       ?fields=like_count,comments_count,timestamp,caption&access_token={token}
    //   plus /insights?metric=plays,reach for reel views
    const base = `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`;
    const res = await fetch(`${base}?fields=like_count,comments_count,timestamp,caption&access_token=${this.accessToken}`);
    if (!res.ok) throw new Error(`Instagram ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const d = await res.json();
    return {
      id: mediaId,
      title: d.caption?.slice(0, 80),
      likes: Number(d.like_count ?? 0),
      comments: Number(d.comments_count ?? 0),
      publishedAt: new Date(d.timestamp ?? Date.now()),
    };
  }
}

/** Facade the API controller calls. Routes to the platform client, maps to ContentMetrics. */
export async function ingestSocialMetrics(
  platform: SocialPlatform,
  postId: string,
  config: SocialIngestConfig,
): Promise<{ post: SocialPostMetric; metrics: ContentMetrics }> {
  let post: SocialPostMetric;
  if (platform === 'youtube') {
    post = await new YouTubeDataClient(config.youtubeApiKey).fetchVideoMetrics(postId);
  } else if (platform === 'instagram') {
    post = await new InstagramGraphClient(config.instagramAccessToken).fetchMediaMetrics(postId);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return { post, metrics: mapPostToMetrics(post) };
}

import type { ResolvedSource } from '../resolver.js';
import type { Statistics, ContentComment, ContentMetadataBlock } from '../content-model.js';
import type { ContentProvider, ProviderMetadata } from './types.js';
import XTwitterScraper from 'x-twitter-scraper';

// X / Twitter provider — backed by the Xquik `x-twitter-scraper` SDK
// (client.x.tweets.retrieve(id) → { tweet, author }). Xquik is a hosted data
// API, so this needs a key: X_TWITTER_SCRAPER_API_KEY (or pass it in). Without
// the key the provider throws a clear, actionable error and the pipeline marks
// the entry failed — the same shape as the Instagram/Supadata provider. There is
// no keyless path for X post data since the API lockdown.

// Derive the awaited result shape from the SDK itself so the mapping tracks the
// package's types without re-declaring them.
type TweetResult = Awaited<ReturnType<XTwitterScraper['x']['tweets']['retrieve']>>;

export interface TwitterProviderConfig {
  apiKey?: string; // X_TWITTER_SCRAPER_API_KEY
}

export class TwitterProvider implements ContentProvider {
  private client: XTwitterScraper | null;
  private cache = new Map<string, Promise<TweetResult>>();

  constructor(cfg: TwitterProviderConfig = {}) {
    const key = cfg.apiKey ?? process.env.X_TWITTER_SCRAPER_API_KEY;
    this.client = key ? new XTwitterScraper({ apiKey: key }) : null;
  }

  canHandle(source: ResolvedSource): boolean {
    return source.platform === 'twitter';
  }

  private require(): XTwitterScraper {
    if (!this.client) {
      throw new Error('X/Twitter ingestion needs X_TWITTER_SCRAPER_API_KEY (Xquik is the tweet data source).');
    }
    return this.client;
  }

  private tweet(source: ResolvedSource): Promise<TweetResult> {
    const id = source.videoId ?? source.canonicalUrl;
    if (!this.cache.has(id)) this.cache.set(id, this.require().x.tweets.retrieve(id));
    return this.cache.get(id)!;
  }

  async fetchMetadata(source: ResolvedSource): Promise<ProviderMetadata> {
    const { tweet, author } = await this.tweet(source);
    const text = tweet.text ?? '';
    const hashtags = [...text.matchAll(/#(\w+)/g)].map((x) => `#${x[1]}`).slice(0, 30);
    const mentions = [...text.matchAll(/@(\w+)/g)].map((x) => `@${x[1]}`).slice(0, 30);
    const firstMedia = tweet.media?.[0];
    const metadata: ContentMetadataBlock = { hashtags, mentions };
    return {
      creator: author?.username ?? source.creator ?? '',
      creatorId: author?.id ?? author?.username ?? source.creator ?? '',
      title: text ? text.split('\n')[0].slice(0, 100) : `Tweet ${tweet.id}`,
      description: text,
      publishedAt: tweet.createdAt ? new Date(tweet.createdAt) : undefined,
      thumbnail: firstMedia?.mediaUrl ?? firstMedia?.url,
      metadata,
    };
  }

  async fetchTranscript(source: ResolvedSource): Promise<string> {
    // The tweet text IS the content — hand it to the reasoner as the transcript.
    return (await this.tweet(source)).tweet.text ?? '';
  }

  async fetchComments(): Promise<ContentComment[]> {
    return []; // replies exist via getReplies but aren't part of the base fetch
  }

  async fetchThumbnail(source: ResolvedSource): Promise<string | undefined> {
    const m = (await this.tweet(source)).tweet.media?.[0];
    return m?.mediaUrl ?? m?.url;
  }

  async fetchStatistics(source: ResolvedSource): Promise<Statistics> {
    const { tweet, author } = await this.tweet(source);
    return {
      views: tweet.viewCount ?? 0,
      likes: tweet.likeCount ?? 0,
      comments: tweet.replyCount ?? 0,
      shares: (tweet.retweetCount ?? 0) + (tweet.quoteCount ?? 0),
      followersAtPublish: author?.followers,
    };
  }
}

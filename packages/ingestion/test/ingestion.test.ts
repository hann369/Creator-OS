import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSource,
  UnsupportedSourceError,
  TikTokProvider,
  TwitterProvider,
  classify,
  HOOK_PATTERNS,
  SEED_PATTERNS,
  computeOutlier,
  buildCreatorProfile,
  findDuplicate,
  parseAnalysis,
  analyzeContent,
  type ContentEntry,
} from '@pronoia/ingestion';
import type { ChatProvider, ChatMessage } from '@pronoia/ai';

// ─── Resolver ────────────────────────────────────────────────────────────────
test('resolver handles all YouTube URL forms', () => {
  const watch = resolveSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(watch.platform, 'youtube');
  assert.equal(watch.videoId, 'dQw4w9WgXcQ');
  assert.equal(watch.mediaType, 'longform');
  assert.equal(watch.canonicalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  const short = resolveSource('https://youtube.com/shorts/abc123XYZ_-');
  assert.equal(short.videoId, 'abc123XYZ_-');
  assert.equal(short.mediaType, 'short');

  const be = resolveSource('https://youtu.be/dQw4w9WgXcQ?t=10');
  assert.equal(be.videoId, 'dQw4w9WgXcQ');
});

test('resolver handles Instagram reel and post forms', () => {
  const reel = resolveSource('https://www.instagram.com/reel/CxYz123/');
  assert.equal(reel.platform, 'instagram');
  assert.equal(reel.videoId, 'CxYz123');
  assert.equal(reel.mediaType, 'short');
  assert.equal(reel.canonicalUrl, 'https://www.instagram.com/reel/CxYz123/');

  const withUser = resolveSource('https://instagram.com/creatorhandle/reel/CxYz123/');
  assert.equal(withUser.creator, 'creatorhandle');

  const post = resolveSource('https://www.instagram.com/p/AbC987/');
  assert.equal(post.mediaType, 'image');
});

test('resolver handles TikTok URL forms', () => {
  const video = resolveSource('https://www.tiktok.com/@creator/video/7212345678901234567');
  assert.equal(video.platform, 'tiktok');
  assert.equal(video.creator, 'creator');
  assert.equal(video.videoId, '7212345678901234567');
  assert.equal(video.mediaType, 'short');
  assert.equal(video.canonicalUrl, 'https://www.tiktok.com/@creator/video/7212345678901234567');

  const photo = resolveSource('https://www.tiktok.com/@creator/photo/7212345678901234567');
  assert.equal(photo.mediaType, 'image');

  // Short share link — id only appears after the redirect, so videoId stays null.
  const short = resolveSource('https://vm.tiktok.com/ZMabc123/');
  assert.equal(short.platform, 'tiktok');
  assert.equal(short.videoId, null);
  assert.equal(short.canonicalUrl, 'https://vm.tiktok.com/ZMabc123');

  // A bare profile is not a single content item.
  assert.throws(() => resolveSource('https://www.tiktok.com/@creator'), UnsupportedSourceError);
});

test('resolver handles X / Twitter status forms', () => {
  const tw = resolveSource('https://twitter.com/handle/status/1580661436218830848');
  assert.equal(tw.platform, 'twitter');
  assert.equal(tw.creator, 'handle');
  assert.equal(tw.videoId, '1580661436218830848');
  assert.equal(tw.mediaType, 'thread');
  // twitter.com and x.com normalize to the same canonical host.
  assert.equal(tw.canonicalUrl, 'https://x.com/handle/status/1580661436218830848');
  assert.equal(resolveSource('https://x.com/handle/status/1580661436218830848').canonicalUrl, tw.canonicalUrl);

  // The user-less /i/web/status/ form resolves with a null creator.
  assert.equal(resolveSource('https://twitter.com/i/web/status/1580661436218830848').creator, null);

  // Scheme-less paste.
  assert.equal(resolveSource('x.com/handle/status/1580661436218830848').platform, 'twitter');

  // A profile without a status is not a single content item.
  assert.throws(() => resolveSource('https://x.com/handle'), UnsupportedSourceError);
});

test('TikTokProvider maps the keyless oEmbed response into ProviderMetadata', async () => {
  const orig = globalThis.fetch;
  // The real endpoint omits author_unique_id and gives the @handle only via
  // author_url — a short-link source (creator null) must still recover it.
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ title: 'a #vibe clip', author_name: 'Creator Name', author_url: 'https://www.tiktok.com/@realhandle', thumbnail_url: 'https://t/x.jpg' }),
  })) as unknown as typeof fetch;
  try {
    const p = new TikTokProvider();
    const src = resolveSource('https://vm.tiktok.com/ZMabc123/');
    assert.equal(p.canHandle(src), true);
    const meta = await p.fetchMetadata(src);
    assert.equal(meta.creator, 'realhandle'); // from author_url, not the display name
    assert.equal(meta.thumbnail, 'https://t/x.jpg');
    assert.deepEqual(meta.metadata.hashtags, ['#vibe']);
    // oEmbed carries no engagement → stats come back zeroed.
    assert.deepEqual(await p.fetchStatistics(), { views: 0, likes: 0, comments: 0, shares: 0 });
  } finally {
    globalThis.fetch = orig;
  }
});

test('TwitterProvider without a key fails with an actionable error', async () => {
  const prev = process.env.X_TWITTER_SCRAPER_API_KEY;
  delete process.env.X_TWITTER_SCRAPER_API_KEY;
  try {
    const p = new TwitterProvider();
    const src = resolveSource('https://x.com/handle/status/1580661436218830848');
    assert.equal(p.canHandle(src), true);
    await assert.rejects(() => p.fetchMetadata(src), /X_TWITTER_SCRAPER_API_KEY/);
  } finally {
    if (prev) process.env.X_TWITTER_SCRAPER_API_KEY = prev;
  }
});

test('resolver tolerates scheme-less pastes and extra hosts/paths', () => {
  // No https:// prefix (the most common paste failure).
  assert.equal(resolveSource('youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(resolveSource('youtu.be/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(resolveSource('www.instagram.com/reel/CxYz1234567/').platform, 'instagram');
  // Mobile/music subdomains + live + nocookie.
  assert.equal(resolveSource('https://m.youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(resolveSource('https://music.youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
  assert.equal(resolveSource('https://www.youtube.com/live/dQw4w9WgXcQ?feature=x').videoId, 'dQw4w9WgXcQ');
  // Shorts + tracking params.
  assert.equal(resolveSource('https://youtube.com/shorts/dQw4w9WgXcQ?si=abc').mediaType, 'short');
});

test('resolver throws on unsupported URLs', () => {
  assert.throws(() => resolveSource('https://example.com/foo'), UnsupportedSourceError);
  assert.throws(() => resolveSource('not a url with spaces'), UnsupportedSourceError);
  assert.throws(() => resolveSource('https://www.youtube.com/@somechannel'), UnsupportedSourceError);
});

// ─── Pattern classifier ──────────────────────────────────────────────────────
test('classify snaps free text onto the nearest library entry', () => {
  assert.equal(classify('this is a case study of a brand', SEED_PATTERNS), 'Case Study');
  assert.equal(classify('this is a raw shock statement', HOOK_PATTERNS), 'Raw Shock');
  // Nothing close → fallback to first entry.
  assert.equal(classify('zzz totally unrelated qqq', SEED_PATTERNS), SEED_PATTERNS[0]);
});

// ─── Outlier math ────────────────────────────────────────────────────────────
test('computeOutlier labels videos against a creator baseline', () => {
  const profile = buildCreatorProfile(
    'c1',
    [
      { creator: 'c1', platform: 'youtube', statistics: { views: 1000, likes: 100, comments: 10, shares: 0 } },
      { creator: 'c1', platform: 'youtube', statistics: { views: 2000, likes: 200, comments: 20, shares: 0 } },
      { creator: 'c1', platform: 'youtube', statistics: { views: 3000, likes: 300, comments: 30, shares: 0 } },
    ] as any,
    'main-space',
  );
  assert.equal(profile.medianViews, 2000);

  const normal = computeOutlier({ views: 2200, likes: 100, comments: 10, shares: 0 }, new Date(), profile);
  assert.equal(normal.label, 'Normal');

  const high = computeOutlier({ views: 5000, likes: 100, comments: 10, shares: 0 }, new Date(), profile);
  assert.equal(high.label, 'High Performer'); // 2.5x median

  const extreme = computeOutlier({ views: 20000, likes: 100, comments: 10, shares: 0 }, new Date(), profile);
  assert.equal(extreme.label, 'Extreme Outlier'); // 10x median

  // No baseline → Normal, score 1.
  const noBase = computeOutlier({ views: 999999, likes: 1, comments: 1, shares: 0 }, new Date(), null);
  assert.equal(noBase.outlierScore, 1);
  assert.equal(noBase.label, 'Normal');
});

// ─── Dedupe ──────────────────────────────────────────────────────────────────
test('findDuplicate catches canonical-url and video-id matches', () => {
  const existing = [
    { id: 'e1', platform: 'youtube' as const, canonicalUrl: 'https://www.youtube.com/watch?v=AAA', videoId: 'AAA' },
  ];
  const byUrl = findDuplicate(
    { id: 'new', platform: 'youtube', canonicalUrl: 'https://www.youtube.com/watch?v=AAA', videoId: 'AAA' },
    existing,
  );
  assert.equal(byUrl.isDuplicate, true);
  assert.equal(byUrl.reason, 'canonical-url');

  const fresh = findDuplicate(
    { id: 'new', platform: 'youtube', canonicalUrl: 'https://www.youtube.com/watch?v=BBB', videoId: 'BBB' },
    existing,
  );
  assert.equal(fresh.isDuplicate, false);

  const self = findDuplicate(
    { id: 'e1', platform: 'youtube', canonicalUrl: 'https://www.youtube.com/watch?v=AAA', videoId: 'AAA' },
    existing,
  );
  assert.equal(self.isDuplicate, false);
});

// ─── Analysis validation + retry ───────────────────────────────────────────────
test('parseAnalysis fills missing fields and snaps patterns', () => {
  const a = parseAnalysis(
    JSON.stringify({ topic: 'AI Agents', hookPattern: 'secret reveal', format: 'case study', confidence: 0.8 }),
  );
  assert.equal(a.topic, 'AI Agents');
  assert.equal(a.hookPattern, 'Secret Reveal');
  assert.equal(a.format, 'Case Study');
  assert.equal(a.seedPattern, 'Case Study'); // deprecated mirror stays in sync
  assert.deepEqual(a.subTopics, []); // missing array → []
  assert.equal(a.audience, ''); // missing string → ''
});

test('parseAnalysis accepts the legacy seedPattern field as format', () => {
  const a = parseAnalysis(JSON.stringify({ topic: 'X', seedPattern: 'listicle', confidence: 0.5 }));
  assert.equal(a.format, 'Listicle');
  assert.equal(a.seedPattern, 'Listicle');
});

test('parseAnalysis rejects non-JSON', () => {
  assert.throws(() => parseAnalysis('sorry, I cannot do that'));
});

test('analyzeContent retries once when first response is invalid', async () => {
  let calls = 0;
  const flaky: ChatProvider = {
    async generateChat(_m: ChatMessage[]) {
      calls++;
      if (calls === 1) return 'not json at all';
      return JSON.stringify({ topic: 'Barefoot Running', hookPattern: 'Experimentation', seedPattern: 'experiment', confidence: 0.9 });
    },
    async *generateChatStream() {
      yield { text: '', done: true };
    },
  };
  const entry = {
    platform: 'youtube', creator: 'x', title: 't', description: 'd', transcript: 'hello',
    comments: [], statistics: { views: 0, likes: 0, comments: 0, shares: 0 }, metadata: { hashtags: [], mentions: [] },
  } as unknown as ContentEntry;

  const result = await analyzeContent(entry, flaky);
  assert.equal(calls, 2); // first failed, retried
  assert.equal(result.topic, 'Barefoot Running');
  assert.equal(result.hookPattern, 'Experimentation');
});

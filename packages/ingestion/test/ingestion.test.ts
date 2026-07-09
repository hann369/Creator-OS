import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSource,
  UnsupportedSourceError,
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

test('resolver throws on unsupported URLs', () => {
  assert.throws(() => resolveSource('https://example.com/foo'), UnsupportedSourceError);
  assert.throws(() => resolveSource('not a url'), UnsupportedSourceError);
});

// ─── Pattern classifier ──────────────────────────────────────────────────────
test('classify snaps free text onto the nearest library entry', () => {
  assert.equal(classify('a fun experiment i ran', SEED_PATTERNS), 'Experiment');
  assert.equal(classify('the biggest mistake people make', HOOK_PATTERNS), 'The biggest mistake');
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
});

// ─── Analysis validation + retry ───────────────────────────────────────────────
test('parseAnalysis fills missing fields and snaps patterns', () => {
  const a = parseAnalysis(
    JSON.stringify({ topic: 'AI Agents', hookPattern: 'the biggest mistake', seedPattern: 'experiment', confidence: 0.8 }),
  );
  assert.equal(a.topic, 'AI Agents');
  assert.equal(a.hookPattern, 'The biggest mistake');
  assert.equal(a.seedPattern, 'Experiment');
  assert.deepEqual(a.subTopics, []); // missing array → []
  assert.equal(a.audience, ''); // missing string → ''
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
      return JSON.stringify({ topic: 'Barefoot Running', hookPattern: 'I tested', seedPattern: 'experiment', confidence: 0.9 });
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
  assert.equal(result.hookPattern, 'I tested');
});

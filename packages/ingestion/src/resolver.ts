import type { Platform, MediaType } from './content-model.js';

// ─────────────────────────────────────────────────────────────────────────────
// Universal Source Resolver (Phase 1).
//
// URL → ResolvedSource. Platform detection is a registry of matchers so new
// platforms (TikTok, X, Reddit…) drop in without touching the resolver itself.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedSource {
  platform: Platform;
  creator: string | null;   // handle if derivable from the URL, else null (filled later by the provider)
  creatorId: string | null;
  url: string;              // the original input
  canonicalUrl: string;     // normalized, dedupe-friendly form
  mediaType: MediaType;
  videoId: string | null;
}

export class UnsupportedSourceError extends Error {
  constructor(url: string) {
    super(`No resolver matched URL: ${url}`);
    this.name = 'UnsupportedSourceError';
  }
}

interface SourceMatcher {
  platform: Platform;
  /** Returns a partial ResolvedSource if this matcher handles the URL, else null. */
  match(url: URL, raw: string): Omit<ResolvedSource, 'url' | 'platform'> | null;
}

function stripAt(handle: string | undefined | null): string | null {
  if (!handle) return null;
  return handle.replace(/^@/, '') || null;
}

const youtubeMatcher: SourceMatcher = {
  platform: 'youtube',
  match(u) {
    const host = u.hostname.replace(/^www\./, '');
    const isYtBe = host === 'youtu.be';
    // www / m / music / gaming subdomains + youtube-nocookie.
    const isYt = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
    if (!isYtBe && !isYt) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    let videoId: string | null = null;
    let mediaType: MediaType = 'longform';

    if (isYtBe) {
      videoId = parts[0] ?? null;
    } else if (parts[0] === 'shorts') {
      videoId = parts[1] ?? null;
      mediaType = 'short';
    } else if (u.pathname === '/watch') {
      videoId = u.searchParams.get('v');
    } else if (parts[0] === 'embed' || parts[0] === 'v' || parts[0] === 'live' || parts[0] === 'shorts') {
      videoId = parts[1] ?? null;
    }

    // YouTube ids are 11 chars of [A-Za-z0-9_-]; guard against picking a handle etc.
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return {
      creator: null,
      creatorId: null,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      mediaType,
      videoId,
    };
  },
};

const instagramMatcher: SourceMatcher = {
  platform: 'instagram',
  match(u) {
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    // /reel/{shortcode}, /p/{shortcode}, /{user}/reel/{shortcode}
    let idx = parts.findIndex((p) => p === 'reel' || p === 'reels' || p === 'p' || p === 'tv');
    if (idx === -1) return null;

    const kind = parts[idx];
    const shortcode = parts[idx + 1] ?? null;
    if (!shortcode) return null;

    const creator = idx > 0 ? stripAt(parts[0]) : null;
    const mediaType: MediaType = kind === 'p' ? 'image' : 'short';
    const canonicalKind = kind === 'reels' ? 'reel' : kind;

    return {
      creator,
      creatorId: null,
      canonicalUrl: `https://www.instagram.com/${canonicalKind}/${shortcode}/`,
      mediaType,
      videoId: shortcode,
    };
  },
};

const tiktokMatcher: SourceMatcher = {
  platform: 'tiktok',
  match(u) {
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'tiktok.com' && !host.endsWith('.tiktok.com')) return null;

    const parts = u.pathname.split('/').filter(Boolean);

    // /@user/video/{id} and /@user/photo/{id} — the canonical desktop forms.
    const kindIdx = parts.findIndex((p) => p === 'video' || p === 'photo');
    if (kindIdx !== -1) {
      const kind = parts[kindIdx];
      const videoId = parts[kindIdx + 1] ?? null;
      if (!videoId || !/^\d{6,25}$/.test(videoId)) return null;
      const creator = parts[0]?.startsWith('@') ? stripAt(parts[0]) : null;
      return {
        creator,
        creatorId: null,
        canonicalUrl: creator
          ? `https://www.tiktok.com/@${creator}/${kind}/${videoId}`
          : `https://www.tiktok.com/${kind}/${videoId}`,
        mediaType: kind === 'photo' ? 'image' : 'short',
        videoId,
      };
    }

    // /v/{id}.html — the legacy mobile share form.
    if (parts[0] === 'v' && parts[1]) {
      const videoId = parts[1].replace(/\.html$/, '');
      if (/^\d{6,25}$/.test(videoId)) {
        return {
          creator: null, creatorId: null,
          canonicalUrl: `https://www.tiktok.com/video/${videoId}`,
          mediaType: 'short', videoId,
        };
      }
    }

    // Short links (vm./vt. hosts, or /t/{code}) — the real id only appears after
    // following the redirect, so keep the normalized short URL and resolve the id
    // later. A bare profile or the homepage is NOT a single content item → null.
    const isShortHost = host === 'vm.tiktok.com' || host === 'vt.tiktok.com';
    if (isShortHost || parts[0] === 't') {
      return {
        creator: null, creatorId: null,
        canonicalUrl: `https://${host}${u.pathname}`.replace(/\/+$/, ''),
        mediaType: 'short', videoId: null,
      };
    }

    return null;
  },
};

const twitterMatcher: SourceMatcher = {
  platform: 'twitter',
  match(u) {
    const host = u.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    if (host !== 'twitter.com' && host !== 'x.com') return null;

    const parts = u.pathname.split('/').filter(Boolean);
    const statusIdx = parts.findIndex((p) => p === 'status' || p === 'statuses');
    if (statusIdx === -1) return null;

    const tweetId = parts[statusIdx + 1] ?? null;
    if (!tweetId || !/^\d{5,25}$/.test(tweetId)) return null;

    // /{user}/status/{id} or the user-less /i/web/status/{id} form.
    const userPart = parts[0];
    const creator = userPart && userPart !== 'i' ? stripAt(userPart) : null;

    return {
      creator,
      creatorId: null,
      canonicalUrl: `https://x.com/${creator ?? 'i'}/status/${tweetId}`,
      mediaType: 'thread',
      videoId: tweetId,
    };
  },
};

const MATCHERS: SourceMatcher[] = [youtubeMatcher, instagramMatcher, tiktokMatcher, twitterMatcher];

/** Register an additional platform matcher (Phase 14 extensibility hook). */
export function registerMatcher(matcher: SourceMatcher): void {
  MATCHERS.push(matcher);
}

export function resolveSource(rawUrl: string): ResolvedSource {
  // Tolerate scheme-less pastes ("youtube.com/…", "instagram.com/reel/…") and
  // stray whitespace/wrapping angle brackets that break new URL().
  let cleaned = rawUrl.trim().replace(/^<|>$/g, '');
  if (!/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;

  let u: URL;
  try {
    u = new URL(cleaned);
  } catch {
    throw new UnsupportedSourceError(rawUrl);
  }

  for (const m of MATCHERS) {
    const partial = m.match(u, rawUrl);
    if (partial) {
      return { platform: m.platform, url: rawUrl, ...partial };
    }
  }
  throw new UnsupportedSourceError(rawUrl);
}

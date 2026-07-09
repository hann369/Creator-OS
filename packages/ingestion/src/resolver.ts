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

const MATCHERS: SourceMatcher[] = [youtubeMatcher, instagramMatcher];

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

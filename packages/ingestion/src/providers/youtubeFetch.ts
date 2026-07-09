// Real, keyless YouTube data fetch via the InnerTube WEB `player` endpoint —
// the same API the youtube.com web player uses. Returns genuine view counts,
// title, author, description, duration, keywords and thumbnails with NO API key.
//
// Transcript strategy — three-tier fallback chain:
//   1. youtube-transcript npm package (jdraper — fastest, most reliable)
//   2. InnerTube caption tracks (JSON3 format)
//   3. InnerTube caption tracks (XML format)
// Each tier is tried in order; the first non-empty result wins.

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // public web client key
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`;
const WEB_CONTEXT = { client: { clientName: 'WEB', clientVersion: '2.20240826.01.00', hl: 'en' } };

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

export interface WatchData {
  title: string;
  author: string;
  channelId: string;
  description: string;
  viewCount: number;
  lengthSeconds: number;
  keywords: string[];
  thumbnail?: string;
  captionTracks: CaptionTrack[];
}

const EMPTY_WATCH: WatchData = {
  title: '', author: '', channelId: '', description: '',
  viewCount: 0, lengthSeconds: 0, keywords: [], thumbnail: undefined, captionTracks: [],
};

/**
 * Keyless oEmbed fallback — a light, public endpoint that survives datacenter
 * IPs (Vercel) where the heavier InnerTube player call is blocked. Gives
 * title / author / thumbnail (no views, no caption tracks).
 */
async function fetchOEmbed(videoId: string): Promise<Partial<WatchData>> {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return {};
    const d: any = await res.json();
    return {
      title: d.title ?? '',
      author: d.author_name ?? '',
      thumbnail: d.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {};
  }
}

/**
 * Fetch video data. Tries the InnerTube WEB player first (rich: views, keywords,
 * caption tracks). If that is blocked/empty — e.g. from a Vercel datacenter IP —
 * falls back to keyless oEmbed for title/author/thumbnail. NEVER throws: returns
 * best-effort data so the ingest always produces a usable entry.
 */
export async function fetchWatchData(videoId: string): Promise<WatchData> {
  let innertube: WatchData | null = null;
  try {
    const res = await fetch(PLAYER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({ context: WEB_CONTEXT, videoId }),
    });
    if (res.ok) {
      const data: any = await res.json();
      const vd = data.videoDetails ?? {};
      const thumbs = vd.thumbnail?.thumbnails ?? [];
      const tracks: CaptionTrack[] = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (vd.title || vd.viewCount) {
        innertube = {
          title: vd.title ?? '',
          author: vd.author ?? '',
          channelId: vd.channelId ?? '',
          description: vd.shortDescription ?? '',
          viewCount: Number(vd.viewCount ?? 0),
          lengthSeconds: Number(vd.lengthSeconds ?? 0),
          keywords: Array.isArray(vd.keywords) ? vd.keywords : [],
          thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : undefined,
          captionTracks: tracks.map((t) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, kind: (t as any).kind })),
        };
      }
    }
  } catch {
    // InnerTube blocked (e.g. Vercel IP) → fall through to oEmbed.
  }

  if (innertube && innertube.title) return innertube;

  // Fallback: keyless oEmbed for the essentials so the card is never blank.
  const oembed = await fetchOEmbed(videoId);
  return {
    ...EMPTY_WATCH,
    ...(innertube ?? {}),
    title: innertube?.title || oembed.title || '',
    author: innertube?.author || oembed.author || '',
    thumbnail: innertube?.thumbnail || oembed.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/** Best-effort keyless transcript — three-tier fallback. Returns '' if all tiers fail. */
export async function fetchTranscriptFromTracks(tracks: CaptionTrack[], videoId?: string, lang = 'en'): Promise<string> {
  // ── Tier 1: youtube-transcript npm package ──────────────────────────────────
  if (videoId) {
    try {
      // Dynamic import keeps the package tree-shaken from bundles that don't need it.
      const { YoutubeTranscript, YoutubeTranscriptTooManyRequestError } = await import('youtube-transcript');
      const snippets = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const text = snippets
        .map((s: { text: string }) => s.text.replace(/\n+/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) return text;
    } catch (err: any) {
      // TooManyRequests → IP blocked; fall through to InnerTube tiers silently.
      // Other errors logged at debug level — we never throw here.
      if (!(err?.constructor?.name === 'YoutubeTranscriptTooManyRequestError')) {
        console.debug('[youtubeFetch] youtube-transcript tier failed:', err?.message ?? err);
      }
    }
  }

  // ── Tiers 2 & 3: InnerTube caption tracks ───────────────────────────────────
  if (!tracks.length) return '';
  const track =
    tracks.find((t) => t.languageCode?.startsWith(lang) && t.kind !== 'asr') ??
    tracks.find((t) => t.languageCode?.startsWith(lang)) ??
    tracks[0];

  for (const fmt of ['&fmt=json3', '']) {
    try {
      const r = await fetch(track.baseUrl + fmt, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!r.ok) continue;
      const body = await r.text();
      if (!body) continue;
      if (fmt.includes('json3')) {
        const j = JSON.parse(body);
        const text = (j.events ?? [])
          .flatMap((e: any) => (e.segs ?? []).map((s: any) => s.utf8))
          .join('')
          .replace(/\n+/g, ' ')
          .trim();
        if (text) return text;
      } else {
        const text = [...body.matchAll(/<text[^>]*>(.*?)<\/text>/gs)]
          .map((m) => decodeEntities(m[1]))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) return text;
      }
    } catch {
      // try next format
    }
  }
  return '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;amp;|&amp;/g, '&')
    .replace(/&amp;lt;|&lt;/g, '<')
    .replace(/&amp;gt;|&gt;/g, '>');
}

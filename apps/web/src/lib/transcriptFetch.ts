// Browser-side YouTube transcript fetcher.
// Runs from the USER's IP — bypasses YouTube's cloud-IP blocks entirely.
//
// Strategy (same 3-tier chain as the server, but executed client-side):
//   1. InnerTube player API → get caption track URLs
//   2. Fetch the signed caption track URL directly (JSON3 format)
//   3. Fallback to XML format
//
// Called from useLibrary after ingestion completes with an empty transcript.
// The result is sent to PATCH /api/v1/library/:id/transcript to persist it.

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`;
const WEB_CONTEXT = { client: { clientName: 'WEB', clientVersion: '2.20240826.01.00', hl: 'en' } };

function extractVideoId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;|&amp;#39;/g, "'")
    .replace(/&quot;|&amp;quot;/g, '"')
    .replace(/&amp;amp;|&amp;/g, '&')
    .replace(/&amp;lt;|&lt;/g, '<')
    .replace(/&amp;gt;|&gt;/g, '>');
}

export async function fetchTranscriptFromBrowser(videoUrl: string): Promise<string> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return '';

  try {
    // Step 1: InnerTube player → get signed caption track URLs
    const playerRes = await fetch(PLAYER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: WEB_CONTEXT, videoId }),
    });
    if (!playerRes.ok) return '';

    const playerData = await playerRes.json();
    const tracks: Array<{ baseUrl: string; languageCode: string; kind?: string }> =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

    if (!tracks.length) return '';

    // Prefer manual English, then auto-generated English, then first track
    const track =
      tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
      tracks.find((t) => t.languageCode?.startsWith('en')) ??
      tracks[0];

    // Step 2: JSON3 format (structured)
    try {
      const r = await fetch(track.baseUrl + '&fmt=json3');
      if (r.ok) {
        const j = await r.json();
        const text = (j.events ?? [])
          .flatMap((e: any) => (e.segs ?? []).map((s: any) => s.utf8))
          .join('')
          .replace(/\n+/g, ' ')
          .trim();
        if (text) return text;
      }
    } catch { /* try next */ }

    // Step 3: XML format (fallback)
    try {
      const r = await fetch(track.baseUrl);
      if (r.ok) {
        const body = await r.text();
        const text = [...body.matchAll(/<text[^>]*>(.*?)<\/text>/gs)]
          .map((m) => decodeEntities(m[1]))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) return text;
      }
    } catch { /* give up */ }
  } catch { /* network error */ }

  return '';
}

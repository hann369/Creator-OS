// Supadata client — used EXCLUSIVELY for Instagram (metadata + transcript).
// YouTube deliberately does NOT go through Supadata (it uses the youtube-transcript
// path in youtubeFetch.ts), so the small monthly Supadata quota is spent only on
// Instagram reels, which have no keyless path.
//
// Auth: header `x-api-key`. Endpoints (v1):
//   GET /metadata?url=…    → { platform, author{username,…}, stats{views,likes,comments,shares}, description, … }
//   GET /transcript?url=…&text=true → { lang, availableLangs, content } (content: string when text=true)

const BASE = 'https://api.supadata.ai/v1';

export interface SupadataMetadata {
  platform: string;
  id: string;
  description: string;
  author: { username?: string; displayName?: string; avatarUrl?: string; verified?: boolean };
  stats: { views: number | null; likes: number | null; comments: number | null; shares: number | null };
  thumbnail?: string;
  duration?: number;
  raw: any;
}

export class SupadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupadataError';
  }
}

export class SupadataClient {
  // Serialize all calls with a minimum gap so parallel provider methods
  // (fetchMetadata + fetchTranscript) don't burst past the free-plan rate limit.
  private chain: Promise<unknown> = Promise.resolve();
  private static MIN_GAP_MS = 1500;

  constructor(private apiKey: string) {
    if (!apiKey) throw new SupadataError('SupadataClient requires an API key (SUPADATA_API_KEY)');
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const out = await fn();
      await new Promise((r) => setTimeout(r, SupadataClient.MIN_GAP_MS));
      return out;
    });
    this.chain = run.catch(() => {});
    return run;
  }

  private get(path: string): Promise<any> {
    return this.serialize(() => this.rawGet(path));
  }

  private async rawGet(path: string): Promise<any> {
    // Free-plan rate limits (429) are transient — back off and retry a few times.
    let wait = 4000;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': this.apiKey } });
      if (res.status === 429 && attempt < 4) {
        await new Promise((r) => setTimeout(r, wait));
        wait = Math.min(wait * 2, 30000);
        continue;
      }
      if (!res.ok) throw new SupadataError(`Supadata ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json();
    }
  }

  async metadata(url: string): Promise<SupadataMetadata> {
    const j = await this.get(`/metadata?url=${encodeURIComponent(url)}`);
    const num = (v: any) => (typeof v === 'number' ? v : null);
    return {
      platform: j.platform,
      id: j.id,
      description: j.description ?? '',
      author: j.author ?? {},
      stats: {
        views: num(j.stats?.views),
        likes: num(j.stats?.likes),
        comments: num(j.stats?.comments),
        shares: num(j.stats?.shares),
      },
      thumbnail: j.media?.thumbnail ?? j.thumbnail,
      duration: typeof j.media?.duration === 'number' ? j.media.duration : undefined,
      raw: j,
    };
  }

  /** Transcript text. Handles the sync ({content}) and async ({jobId}) shapes. */
  async transcript(url: string, lang = 'en'): Promise<string> {
    let j = await this.get(`/transcript?url=${encodeURIComponent(url)}&text=true&lang=${lang}`);
    if (j?.jobId) {
      for (let i = 0; i < 20 && !j?.content; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        j = await this.get(`/transcript/${j.jobId}`);
        if (j?.status === 'failed') throw new SupadataError('Supadata transcript job failed');
      }
    }
    const content = j?.content;
    return Array.isArray(content) ? content.map((c: any) => c.text).join(' ').trim() : String(content ?? '').trim();
  }
}

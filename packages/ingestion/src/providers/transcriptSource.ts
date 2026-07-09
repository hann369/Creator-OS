import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ResolvedSource } from '../resolver.js';
import type { Platform } from '../content-model.js';
import { ytdlpAvailable, ytdlpDownloadAudio, type YtDlpOptions } from './ytdlp.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transcript Source — pluggable, env-gated third-party transcription.
//
// Mirrors the credential-free pattern in packages/services/src/socialIngest.ts:
// without an API key the client throws TranscriptCredentialsMissingError (a clean
// 501 upstream), so nothing calls a live API until a key is supplied. Swapping
// vendors (proactor.ai, a self-hosted whisper service, …) is a one-file change;
// the ContentProvider contract above it never changes.
// ─────────────────────────────────────────────────────────────────────────────

export class TranscriptCredentialsMissingError extends Error {
  constructor(public platform: Platform, public envVar: string) {
    super(`No transcript credentials for ${platform}. Set ${envVar} to enable transcription.`);
    this.name = 'TranscriptCredentialsMissingError';
  }
}

export interface TranscriptSource {
  fetchTranscript(source: ResolvedSource): Promise<string>;
}

export interface TranscriptSourceConfig {
  /** Base endpoint of the transcript vendor (e.g. proactor.ai link-to-text API). */
  endpoint?: string;
  /** Vendor API key. Read from env at the call site; absent → throws cleanly. */
  apiKey?: string;
  envVar?: string;
  /**
   * The JSON body key used to pass the video URL to the vendor.
   * Defaults to 'url'. Set to 'video_url' for the jaypaun007 API
   * (https://youtube-transcript-api-tau-one.vercel.app/transcript).
   */
  urlBodyKey?: string;
}

/**
 * Generic HTTP transcript vendor. The exact request/response contract is vendor
 * specific and confirmed at wire-up time; the shape below is the common
 * "POST {url} → { transcript }" form and is deliberately defensive.
 */
export class HttpTranscriptSource implements TranscriptSource {
  constructor(private cfg: TranscriptSourceConfig) {}

  async fetchTranscript(source: ResolvedSource): Promise<string> {
    if (!this.cfg.endpoint) {
      throw new TranscriptCredentialsMissingError(source.platform, this.cfg.envVar ?? 'TRANSCRIPT_API_URL');
    }
    const bodyKey = this.cfg.urlBodyKey ?? 'url';
    const res = await fetch(this.cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({ [bodyKey]: source.canonicalUrl }),
    });
    if (!res.ok) {
      throw new Error(`Transcript vendor ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data: any = await res.json();
    return String(data.transcript ?? data.text ?? '');
  }
}

/** A transcript source backed by a value already in hand (fixtures / captures). */
export class StaticTranscriptSource implements TranscriptSource {
  constructor(private transcript: string) {}
  async fetchTranscript(): Promise<string> {
    return this.transcript;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// yt-dlp + Mistral voxtral transcript source — the reelstudio technique.
//
// Downloads the media's audio with yt-dlp (any site yt-dlp supports: Instagram,
// TikTok, X, YouTube) and transcribes it with Mistral's audio endpoint. This is
// the ONLY keyless path to Instagram Reel transcripts — but Instagram gates
// unauthenticated/datacenter access, so a logged-in cookies.txt must be provided
// via YTDLP_COOKIES / INSTAGRAM_COOKIES. Requires the yt-dlp binary (worker/
// local host, not serverless); ytdlpAvailable() lets callers degrade cleanly.
// ─────────────────────────────────────────────────────────────────────────────
export interface YtDlpMistralConfig {
  mistralKey?: string;
  transcriptionModel?: string; // default voxtral-mini-latest
  ytdlp?: YtDlpOptions;
}

export class YtDlpMistralTranscriptSource implements TranscriptSource {
  constructor(private cfg: YtDlpMistralConfig = {}) {}

  async isUsable(): Promise<boolean> {
    return Boolean(this.cfg.mistralKey ?? process.env.MISTRAL_API_KEY) && (await ytdlpAvailable(this.cfg.ytdlp ?? {}));
  }

  async fetchTranscript(source: ResolvedSource): Promise<string> {
    const key = this.cfg.mistralKey ?? process.env.MISTRAL_API_KEY;
    if (!key) throw new TranscriptCredentialsMissingError(source.platform, 'MISTRAL_API_KEY');
    if (!(await ytdlpAvailable(this.cfg.ytdlp ?? {}))) {
      throw new Error('yt-dlp not available in this runtime (needs a worker/local host, not serverless)');
    }

    const out = join(tmpdir(), `pronoia-${randomUUID()}.m4a`);
    try {
      await ytdlpDownloadAudio(source.canonicalUrl, out, this.cfg.ytdlp ?? {});
      const buf = await readFile(out);
      const fd = new FormData();
      fd.append('file', new Blob([buf], { type: 'audio/mp4' }), 'audio.m4a');
      fd.append('model', this.cfg.transcriptionModel ?? process.env.MISTRAL_TRANSCRIPTION_MODEL ?? 'voxtral-mini-latest');
      const res = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: fd,
      });
      if (!res.ok) throw new Error(`Mistral transcription ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data: any = await res.json();
      return String(data.text ?? '');
    } finally {
      await unlink(out).catch(() => {});
    }
  }
}

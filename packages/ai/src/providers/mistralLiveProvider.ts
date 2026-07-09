import {
  AIProvider,
  AIStreamChunk,
  ChatProvider,
  ReasoningProvider,
  VisionProvider,
  EmbeddingProvider,
  ChatMessage,
  ReasoningResult,
} from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Live Mistral provider — the first REAL (non-mock) provider.
//
// One Mistral API key covers everything the Brand-DNA feature needs:
//   • reasoning / chat  → mistral-small-latest   (proven in apps/web/src/lib/reasoning.ts)
//   • vision            → pixtral-12b-2409        (multimodal, OpenAI-compatible endpoint)
//
// The key stays SERVER-SIDE (apps/api). Never ships to the browser — that was the
// open security caveat with the existing VITE_MISTRAL_API_KEY in apps/web/.env.
// ─────────────────────────────────────────────────────────────────────────────

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';

export interface MistralLiveOptions {
  chatModel?: string;   // default: mistral-small-latest
  visionModel?: string; // default: pixtral-12b-2409
  embedModel?: string;  // default: mistral-embed (1024 dims)
}

/** Best-effort mime sniff so Pixtral receives a correctly-typed data URI. */
function sniffMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'image/jpeg';
}

export class MistralLiveProvider implements AIProvider, ChatProvider, ReasoningProvider, VisionProvider, EmbeddingProvider {
  id = 'mistral';
  name = 'Mistral (live)';

  private apiKey: string;
  private chatModel: string;
  private visionModel: string;
  private embedModel: string;

  constructor(apiKey: string, opts: MistralLiveOptions = {}) {
    if (!apiKey) throw new Error('MistralLiveProvider requires an API key');
    this.apiKey = apiKey;
    this.chatModel = opts.chatModel ?? process.env.MISTRAL_CHAT_MODEL ?? 'mistral-small-latest';
    this.visionModel = opts.visionModel ?? process.env.MISTRAL_VISION_MODEL ?? 'pixtral-12b-2409';
    this.embedModel = opts.embedModel ?? process.env.MISTRAL_EMBED_MODEL ?? 'mistral-embed';
  }

  initialize(_config: Record<string, any>): void {
    // Live provider is configured via the constructor; nothing to do.
  }

  /** Low-level call against the OpenAI-compatible chat/completions endpoint. */
  private async post(body: Record<string, any>): Promise<string> {
    const res = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Mistral ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  async generateChat(messages: ChatMessage[], options?: Record<string, any>): Promise<string> {
    return this.post({
      model: this.chatModel,
      messages,
      temperature: options?.temperature ?? 0.3,
      ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
    });
  }

  async *generateChatStream(messages: ChatMessage[], options?: Record<string, any>): AsyncGenerator<AIStreamChunk> {
    // Non-streaming under the hood; yield once so callers relying on the async
    // iterator contract still work. (Token streaming can be added later.)
    const full = await this.generateChat(messages, options);
    yield { text: full, done: true };
  }

  async generateReasoning(prompt: string, options?: Record<string, any>): Promise<ReasoningResult> {
    const raw = await this.post({
      model: this.chatModel,
      temperature: options?.temperature ?? 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Return ONLY a JSON object with exactly these fields: ' +
            '{"observation": string, "hypotheses": string[], "evidence": string[], ' +
            '"conclusion": string, "recommendations": string[], "confidence": number}.',
        },
        { role: 'user', content: prompt },
      ],
    });

    try {
      const p = JSON.parse(raw);
      return {
        observation: p.observation ?? '',
        hypotheses: Array.isArray(p.hypotheses) ? p.hypotheses : [],
        evidence: Array.isArray(p.evidence) ? p.evidence : [],
        conclusion: p.conclusion ?? raw,
        recommendations: Array.isArray(p.recommendations) ? p.recommendations : [],
        confidence: typeof p.confidence === 'number' ? p.confidence : 0.6,
      };
    } catch {
      return { observation: '', hypotheses: [], evidence: [], conclusion: raw, recommendations: [], confidence: 0.5 };
    }
  }

  /** Multimodal analysis via Pixtral. Returns the raw JSON string — the caller
   *  (BrandDnaService.safeParseVision) extracts palette/fonts defensively. */
  async analyzeImage(imageBuffer: Buffer, prompt: string, _options?: Record<string, any>): Promise<string> {
    const dataUri = `data:${sniffMime(imageBuffer)};base64,${imageBuffer.toString('base64')}`;
    return this.post({
      model: this.visionModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: dataUri },
          ],
        },
      ],
    });
  }

  /** Real embeddings via Mistral's /v1/embeddings (mistral-embed → 1024 dims). */
  async generateEmbedding(text: string): Promise<number[]> {
    const [v] = await this.generateEmbeddings([text]);
    return v;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    // Mistral rejects empty strings; substitute a single space so indices align.
    const input = texts.map((t) => (t && t.trim() ? t.slice(0, 8000) : ' '));
    const res = await fetch(MISTRAL_EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.embedModel, input }),
    });
    if (!res.ok) {
      throw new Error(`Mistral embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data: any = await res.json();
    // Preserve request order via the `index` field.
    return (data.data ?? [])
      .slice()
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((d: any) => d.embedding as number[]);
  }
}

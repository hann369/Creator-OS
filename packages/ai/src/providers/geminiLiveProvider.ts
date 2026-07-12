import { AIProvider, AIStreamChunk, ChatProvider, ChatMessage } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Live Gemini provider — the second REAL provider (after Mistral).
//
// Speaks the native generateContent protocol (same mapping the reasoning proxy
// in apps/api already proved out): system messages become systemInstruction,
// assistant turns become role "model". The key is sent via the x-goog-api-key
// header so it never appears in URLs or logs. Chat-only for now — vision and
// embeddings keep running through Mistral.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiLiveOptions {
  chatModel?: string; // default: gemini-2.5-flash
}

export class GeminiLiveProvider implements AIProvider, ChatProvider {
  id = 'gemini';
  name = 'Google Gemini (live)';

  private apiKey: string;
  private chatModel: string;

  constructor(apiKey: string, opts: GeminiLiveOptions = {}) {
    if (!apiKey) throw new Error('GeminiLiveProvider requires an API key');
    this.apiKey = apiKey;
    this.chatModel = opts.chatModel ?? process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash';
  }

  initialize(_config: Record<string, any>): void {
    // Configured via the constructor; nothing to do.
  }

  async generateChat(messages: ChatMessage[], options?: Record<string, any>): Promise<string> {
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const conversation = messages.filter((m) => m.role !== 'system');

    const body: Record<string, any> = {
      contents: conversation.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
        ...(options?.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (systemMsgs.length > 0) {
      body.systemInstruction = { parts: systemMsgs.map((m) => ({ text: m.content })) };
    }

    const res = await fetch(`${GEMINI_BASE}/${this.chatModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  }

  async *generateChatStream(messages: ChatMessage[], options?: Record<string, any>): AsyncGenerator<AIStreamChunk> {
    const full = await this.generateChat(messages, options);
    yield { text: full, done: true };
  }
}

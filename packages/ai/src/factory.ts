import type { AIProvider } from './types.js';
import { MistralLiveProvider } from './providers/mistralLiveProvider.js';
import { GeminiLiveProvider } from './providers/geminiLiveProvider.js';
import { PomelliProvider, MistralProvider } from './providers/mockProviders.js';

export interface ProviderConfig {
  /** Server-side Mistral API key. When present, the live Mistral/Pixtral provider
   *  is used for chat, reasoning AND vision (one key covers all three). */
  mistralKey?: string;
  /** Gemini API key (chat only). Used when providerId is 'gemini'. */
  geminiKey?: string;
}

/**
 * Resolve a concrete provider instance for a routed provider id.
 *
 * Two real providers exist: Mistral (chat/reasoning/vision/embeddings — the
 * default and fallback) and Gemini (chat, per-user key from remix_settings).
 * 'gemini' falls back to Mistral when no Gemini key is present, and everything
 * falls back to the deterministic mocks when no key is configured at all, so
 * the app never breaks in dev/offline (strangler-fig rule).
 */
export function resolveProvider(providerId: string, cfg: ProviderConfig): AIProvider {
  if (providerId === 'gemini' && cfg.geminiKey) {
    return new GeminiLiveProvider(cfg.geminiKey);
  }
  if (cfg.mistralKey) {
    return new MistralLiveProvider(cfg.mistralKey);
  }
  // Offline / no-key fallback → mocks.
  return providerId === 'mistral' ? new MistralProvider() : new PomelliProvider();
}

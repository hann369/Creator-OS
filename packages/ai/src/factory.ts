import type { AIProvider } from './types.js';
import { MistralLiveProvider } from './providers/mistralLiveProvider.js';
import { PomelliProvider, MistralProvider } from './providers/mockProviders.js';

export interface ProviderConfig {
  /** Server-side Mistral API key. When present, the live Mistral/Pixtral provider
   *  is used for chat, reasoning AND vision (one key covers all three). */
  mistralKey?: string;
}

/**
 * Resolve a concrete provider instance for a routed provider id.
 *
 * Strategy: we currently hold exactly one real key (Mistral). Pixtral gives it
 * vision, so a single MistralLiveProvider satisfies every capability the app
 * routes for today. If no key is configured we fall back to the deterministic
 * mock providers so the app never breaks in dev/offline (strangler-fig rule).
 *
 * When a second real provider is added (e.g. a dedicated vision model), branch
 * on `providerId` here — the call sites do not change.
 */
export function resolveProvider(providerId: string, cfg: ProviderConfig): AIProvider {
  if (cfg.mistralKey) {
    return new MistralLiveProvider(cfg.mistralKey);
  }
  // Offline / no-key fallback → mocks.
  return providerId === 'mistral' ? new MistralProvider() : new PomelliProvider();
}

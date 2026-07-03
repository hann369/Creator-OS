import { synthesizeIdentity } from './synthesis.js';
import { learnIdentity } from './learning.js';

export * from './synthesis.js';
export * from './learning.js';

// The engine facade. Named distinctly from cognition's `IdentityEngine`
// (that one is semantic NodeIdentity — unrelated to brand identity).
export const BrandIdentityEngine = {
  /** Moodboard[] → Partial<BrandIdentity> (colors/typography deterministic, voice/hooks via AI). */
  synthesize: synthesizeIdentity,
  /** Attribute content performance back onto the identity and re-rank its hooks. */
  learn: learnIdentity,
};

import type { Moodboard, Color, Typography, Voice, BrandIdentity } from '@pronoia/domain';
import type { ReasoningProvider } from '@pronoia/ai';

// ─────────────────────────────────────────────────────────────────────────────
// Identity synthesis (Step 4, slice 1) — PURE over domain types.
//
// Aggregates the moodboards that feed a brand into a BrandIdentity base:
//   • colors     — palettes merged, ranked by frequency across boards
//   • typography — the most common fonts become heading/body/accent
//   • voice+hooks — optional AI pass via a ReasoningProvider (mock-safe)
//
// No IO: providers are injected. Returns Partial<BrandIdentity> (the caller adds
// the Entity spine + persists via the EntityStore).
// ─────────────────────────────────────────────────────────────────────────────

export interface SynthesisDeps {
  reasoning?: ReasoningProvider;
}

/** The single most frequent non-empty value, or undefined. */
function mostCommon(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

export async function synthesizeIdentity(
  moodboards: Moodboard[],
  deps: SynthesisDeps = {},
): Promise<Partial<BrandIdentity>> {
  // 1. Colors — merge every board's palette, rank by how often each hex appears.
  const byHex = new Map<string, { color: Color; n: number }>();
  for (const mb of moodboards) {
    for (const c of mb.palette ?? []) {
      if (!c?.hex) continue;
      const key = c.hex.toLowerCase();
      const existing = byHex.get(key);
      if (existing) existing.n += 1;
      else byHex.set(key, { color: c, n: 1 });
    }
  }
  const colors: Color[] = [...byHex.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)
    .map(e => e.color);

  // 2. Typography — the dominant fonts across the boards.
  const typography: Typography = {
    heading: mostCommon(moodboards.map(m => m.fonts?.title)),
    body: mostCommon(moodboards.map(m => m.fonts?.caption)),
    accent: mostCommon(moodboards.map(m => m.fonts?.subheading)),
  };

  // 3. Voice + hooks — optional AI enrichment. We map the structured
  //    ReasoningResult onto identity fields (robust with mock + live providers).
  let voice: Voice = { doList: [], dontList: [] };
  let hooks: string[] = [];

  if (deps.reasoning && moodboards.length > 0) {
    const brief = moodboards
      .map(m => `- ${m.client || m.title}: ${m.description}. ${m.notes ?? ''}`)
      .join('\n');
    try {
      const r = await deps.reasoning.generateReasoning(
        'You are a brand strategist. Analyze these brand moodboards and derive the brand identity.\n' +
          'In "observation": state the brand VOICE/tone in one sentence.\n' +
          'In "recommendations": list concrete DO guidelines for the voice.\n' +
          'In "evidence": list DON\'T guidelines (what to avoid).\n' +
          'In "hypotheses": list 3-5 recurring HOOK structures that fit this brand.\n\n' +
          `Moodboards:\n${brief}`,
      );
      voice = {
        tone: r.observation || undefined,
        doList: Array.isArray(r.recommendations) ? r.recommendations : [],
        dontList: Array.isArray(r.evidence) ? r.evidence : [],
      };
      hooks = Array.isArray(r.hypotheses) ? r.hypotheses : [];
    } catch {
      // AI failure must not break synthesis — keep the deterministic result.
    }
  }

  return {
    type: 'identity',
    colors,
    typography,
    voice,
    hooks,
    moodboardIds: moodboards.map(m => m.id),
  };
}

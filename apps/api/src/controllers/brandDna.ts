import { Router } from 'express';
import { scrapeSiteLightweight, analyzeBrandDna, buildMoodboardFromDna } from '@pronoia/services';
import { ModelRegistry, resolveProvider } from '@pronoia/ai';
import type { VisionProvider, ReasoningProvider } from '@pronoia/ai';

export const brandDnaRouter = Router();

const registry = new ModelRegistry();

brandDnaRouter.post('/extract', async (req, res) => {
  const { url, workspaceId } = req.body ?? {};

  if (!url || !workspaceId) {
    return res.status(400).json({ error: 'url and workspaceId are required' });
  }

  try {
    // 1. Capability-based Routing via ModelRegistry
    const visionMetadata = registry.route({ needsVision: true });
    const reasoningMetadata = registry.route({ needsReasoning: true });

    // 2. Resolve provider instances (live Mistral/Pixtral when a key is present,
    //    deterministic mocks otherwise). Key stays server-side.
    const mistralKey = process.env.MISTRAL_API_KEY;
    const vision = resolveProvider(visionMetadata.providerId, { mistralKey }) as unknown as VisionProvider;
    const reasoning = resolveProvider(reasoningMetadata.providerId, { mistralKey }) as unknown as ReasoningProvider;

    // 3. Scrape website (Cheerio lightweight)
    const site = await scrapeSiteLightweight(url);

    // 4. Run AI analysis
    const dna = await analyzeBrandDna(site, { vision, reasoning });

    // 5. Build moodboard
    const moodboard = buildMoodboardFromDna(site, dna, { workspaceId });

    return res.json({ moodboard });
  } catch (error: any) {
    console.error('[BrandDNA] Extraction failed:', error);
    return res.status(502).json({ error: error.message || 'Brand DNA extraction failed' });
  }
});

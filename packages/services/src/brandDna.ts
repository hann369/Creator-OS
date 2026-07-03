import * as cheerio from 'cheerio';
import type { Moodboard, Color, BoardFonts, MoodSection, MoodboardItem } from '@pronoia/domain';
import type { VisionProvider, ReasoningProvider } from '@pronoia/ai';

export interface ExtractedSiteData {
  url: string;
  title: string;
  description: string;
  ogImageUrl?: string;
  faviconUrl?: string;
}

export interface BrandDnaAnalysis {
  description: string;      // 1-2 sentences brand essence
  brandStrategy: string;    // short strategic tagline/action
  palette: Color[];         // from vision
  fonts: BoardFonts;        // title, subheading, caption
  voiceTone: string;
}

// A1: derive brand name from hostname, not raw title
function brandFromUrl(url: string, title: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.')[0]!;
    return base.charAt(0).toUpperCase() + base.slice(1); // stripe.com → "Stripe"
  } catch {
    return (title.split('|').pop() ?? title).trim();
  }
}

// A6: clamp subtitle at word boundary ≤ 100 chars
function clampSubtitle(text: string, max = 100): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/**
 * Defensive JSON extraction and parsing of vision outputs
 */
export function safeParseVision(visionRaw: string): { palette: Color[]; fonts: BoardFonts } {
  const defaultPalette: Color[] = [
    { hex: '#1E3A8A', name: 'Primary', role: 'accent' },
    { hex: '#00E5FF', name: 'Accent', role: 'accent' },
    { hex: '#0A0E17', name: 'Ink', role: 'background' },
    { hex: '#F3F4F6', name: 'Light Gray', role: 'background' }
  ];
  const defaultFonts: BoardFonts = {
    title: 'Inter',
    subheading: 'Inter',
    caption: 'Inter'
  };

  try {
    const jsonMatch = visionRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const palette: Color[] = Array.isArray(parsed.palette)
        ? parsed.palette.map((c: any) => {
            if (typeof c === 'string') return { hex: c };
            return {
              hex: c.hex || '#1E3A8A',
              name: c.name,
              role: c.role
            };
          })
        : defaultPalette;

      const fonts: BoardFonts = parsed.fonts && typeof parsed.fonts === 'object'
        ? {
            title: parsed.fonts.title || defaultFonts.title,
            subheading: parsed.fonts.subheading || defaultFonts.subheading,
            caption: parsed.fonts.caption || defaultFonts.caption
          }
        : defaultFonts;

      return { palette, fonts };
    }
  } catch (e) {
    // ignore parsing errors and fall back to default
  }

  return { palette: defaultPalette, fonts: defaultFonts };
}

/** Stufe A: Fetch HTML and parse meta tags/favicon. Serverless-safe. */
export async function scrapeSiteLightweight(url: string): Promise<ExtractedSiteData> {
  const res = await fetch(url, { headers: { 'user-agent': 'PronoiaBrandDNA/1.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  const abs = (v?: string) => {
    if (!v) return undefined;
    try {
      return new URL(v, url).href;
    } catch {
      return undefined;
    }
  };

  return {
    url,
    title: $('meta[property="og:title"]').attr('content') || $('title').text().trim() || url,
    description:
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') || '',
    ogImageUrl: abs($('meta[property="og:image"]').attr('content')),
    faviconUrl: abs($('link[rel~="icon"]').attr('href')) ?? abs('/favicon.ico'),
  };
}

/** Perform brand DNA analysis using registry providers. */
export async function analyzeBrandDna(
  site: ExtractedSiteData,
  deps: { vision: VisionProvider; reasoning: ReasoningProvider },
): Promise<BrandDnaAnalysis> {
  let visionRaw = '';
  const imgUrl = site.ogImageUrl ?? site.faviconUrl;
  if (imgUrl) {
    try {
      const imgRes = await fetch(imgUrl);
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        visionRaw = await deps.vision.analyzeImage(
          buf,
          'You are a brand designer. Analyze this brand image and return ONLY a JSON object ' +
            'with EXACTLY this shape (no prose): ' +
            '{"palette":[{"hex":"#RRGGBB","name":"short name","role":"accent|background|text"}], ' +
            '"fonts":{"title":"font family name","subheading":"font family name","caption":"font family name"}, ' +
            '"mood":"one short sentence"}. ' +
            'Provide 3-5 palette colors as real hex codes sampled from the image. ' +
            'For fonts, name the closest well-known typeface for each role.',
        );
      }
    } catch (e) {
      console.warn('Failed to fetch image for vision analysis:', e);
    }
  }

  const reasoning = await deps.reasoning.generateReasoning(
    `Brand: ${site.title} — ${site.description}\nVision analysis: ${visionRaw}\n` +
      `Derive: a 1-2 sentence brand essence, a short brand strategy, a voice tone.`,
  );

  const parsed = safeParseVision(visionRaw);
  return {
    description: reasoning.conclusion || site.description,
    brandStrategy: (reasoning.recommendations && reasoning.recommendations.length > 0)
      ? reasoning.recommendations.join(' ')
      : 'Establish a clean, digital presence matching the brand essence.',
    palette: parsed.palette,
    fonts: parsed.fonts,
    voiceTone: reasoning.observation || 'Neutral, informative',
  };
}

/** Construct complete Moodboard entity (draft) with soft-coded provenance. */
export function buildMoodboardFromDna(
  site: ExtractedSiteData,
  dna: BrandDnaAnalysis,
  ctx: { workspaceId: string; now?: Date },
): Moodboard {
  const now = ctx.now ?? new Date();
  const t = now.getTime();
  const id = `mb-dna-${t}-${Math.random().toString(36).substring(2, 6)}`;

  // A2: palette as visible color items
  const paletteItems: MoodboardItem[] = dna.palette.map((c, i) => ({
    id: `mi-col-${t}-${i}`,
    kind: 'color',
    ratio: '1:1',
    label: c.name ?? c.hex,
    color: c.hex,
    caption: c.role ?? '',
  }));

  // A3: og:image as an image item
  const imageItems: MoodboardItem[] = site.ogImageUrl
    ? [{
        id: `mi-img-${t}`,
        kind: 'image',
        ratio: '16:9',
        label: 'Brand Image',
        imageUrl: site.ogImageUrl,
        source: site.url,
      }]
    : [];

  // A4: richer two-section structure
  const sections: MoodSection[] = [
    {
      id: `sec-overview-${t}`,
      title: 'Overview',
      items: [
        ...imageItems,
        {
          id: `mi-strategy-${t}`,
          kind: 'text',
          ratio: '16:9',
          label: 'Brand Strategy',
          caption: dna.brandStrategy,
        },
        {
          id: `mi-voice-${t}`,
          kind: 'text',
          ratio: '16:9',
          label: 'Voice & Mood',
          caption: dna.voiceTone,
        },
      ],
    },
    {
      id: `sec-palette-${t}`,
      title: 'Palette & Type',
      items: paletteItems,
    },
  ];

  return {
    id,
    workspaceId: ctx.workspaceId,
    type: 'moodboard',
    title: site.title,
    metadata: { importedFrom: site.url },
    createdAt: now,
    updatedAt: now,
    boardType: 'website_branding',
    // A1: brand name from domain hostname
    client: brandFromUrl(site.url, site.title),
    // A6: subtitle clamped at word boundary
    subtitle: clampSubtitle(site.description),
    note: `Imported from ${site.url}`,
    description: dna.description,
    tags: ['imported', 'brand-dna'],
    palette: dna.palette,
    fonts: dna.fonts,
    status: 'draft',
    sections,
    notes: `Scraped ${now.toISOString()} · voice: ${dna.voiceTone}`,
  };
}

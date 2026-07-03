# ANTIGRAVITY — TASK BRIEF: Brand-DNA-Import

**Website-URL → automatisch befülltes Moodboard (Open-Pomelli-Logik, nativ in TypeScript)**

> Teil des Umbaus von Pronoia zu einem Cognitive OS mit typisiertem **Entity-Spine**.
> Baut direkt auf **Step 2** auf (`Moodboard` ist bereits eine echte Domain-Entity + `styled_by`-Relationship).
> Ziel: Ein Creator gibt eine URL ein → wir extrahieren die „Business DNA" (Farben, Fonts, Ton, Strategie)
> und erzeugen daraus **automatisch** ein `Moodboard`, das an die bestehende Identity-Pipeline andockt.

---

## 0. Grundregeln (NICHT verletzen)

| Regel | Beschreibung |
|---|---|
| **Strangler-Fig** | Die laufende App darf zu KEINEM Zeitpunkt brechen. Nach jedem Teilschritt: `npx tsc --noEmit` über die betroffenen Pakete **und** `vite build apps/web` grün. |
| **Provider-Abstraktion nutzen** | KEINE direkten SDK-Calls (OpenAI/Anthropic) in Service-Code. Vision/Reasoning **immer** über die bestehende `@pronoia/ai`-Registry (`VisionProvider`, `ReasoningProvider`). |
| **Kein Chromium im Request-Pfad** | Der synchrone REST-Endpoint darf **kein** Playwright starten. Default = Lightweight-Scraper. Headless nur optional hinter der Queue. |
| **Typed, nicht untyped** | Rückgabe ist ein echtes `Moodboard` (extends `Entity`) — kein `Record<string,unknown>`-Bag. Provenance = echte `Relationship('derived_from')`. |
| **Anti-Patterns** | Keine Dashboards/Scores/Streaks/Chatbot-UI. Der Import ist ein stiller *See → Do*-Schritt, kein „Analyse-Dashboard". |

---

## 1. Ausgangspunkt (Fakten aus dem Code — NICHT annehmen, sondern nutzen)

- **Domain** (`packages/domain/src/entity.ts`) hat bereits:
  - `Moodboard extends Entity` mit Pflichtfeldern: `type:'moodboard'`, `boardType`, `client`, `subtitle`, `note`, `description`, `tags`, `palette: Color[]`, `fonts: BoardFonts`, `status`, `sections: MoodSection[]`, `notes` — **plus** die Entity-Spine-Felder `id, workspaceId, title, metadata, createdAt, updatedAt`.
  - `Color = { hex; name?; role? }`
  - `BoardFonts = { title; subheading; caption }` (String-Felder, **kein** `string[]`!)
  - `MoodSection = { id; title; items: MoodboardItem[] }`, `MoodboardItem` mit `kind`, `ratio`, `label`, `caption?` …
  - `EntityType` enthält `'research'`; `RelationshipType` enthält `'derived_from'` und `'styled_by'`.
- **AI** (`packages/ai/src`) exponiert **Interfaces**, keine fertige `AIService`:
  - `VisionProvider.analyzeImage(imageBuffer: Buffer, prompt: string, options?)`
  - `ReasoningProvider.generateReasoning(prompt, options?) → ReasoningResult`
  - `ChatProvider.generateChat(messages, options?)`
  - `ModelRegistry` + `globalHealthMonitor`; `'pomelli'` ist bereits als Provider-ID vorregistriert.
- **Services** (`packages/services/src`) folgt dem Muster `ingestion.ts`, `observation.ts`, … (ein Modul pro Fähigkeit, re-exportiert über `index.ts`).
- **API** (`apps/api/src`) registriert Router in `main.ts` (`app.use('/api/v1/...', router)`); Controller liegen in `src/controllers/`. Es gibt bereits eine Queue unter `src/queues/`.

> ⚠️ **Korrektur gegenüber dem ursprünglichen Plan:** `AIService.analyzeBrandVisuals(...)` existiert **nicht** — bauen auf `VisionProvider`/`ReasoningProvider`. Die CSS-`cssRules`-Farbextraktion aus dem Plan ist unzuverlässig (matcht nur `#RRGGBB`, scheitert an `rgb()`/`hsl()`/CSS-Vars/cross-origin) → Farben werden **per Vision** aus dem Bild gezogen, nicht per Stylesheet-Parsing.

**Ziel:** URL → `Moodboard`-Entity (Draft), verankert per `derived_from` an einem `research`-Entity als Provenance.

---

## 2. Architektur-Entscheidung (verbindlich)

**Zwei-Stufen-Scraper, Lightweight zuerst:**

```
POST /api/v1/brand-dna/extract  { url }
        │
        ▼
 [Stufe A · Lightweight — Default, serverless-safe]
   fetch(url) → HTML
   cheerio: <title>, meta[description], og:title/description/image, <link rel=icon>
   → ExtractedSiteData { title, description, ogImageUrl, faviconUrl }
        │
        ▼
 [Vision + Reasoning über @pronoia/ai-Registry]
   VisionProvider.analyzeImage(ogImage) → { palette[], fonts, mood }
   ReasoningProvider.generateReasoning(text+palette) → { description, brandStrategy, voice }
        │
        ▼
 buildMoodboard(...) → Moodboard (draft) + research-Entity + Relationship('derived_from')
```

**Stufe B (Playwright) ist NICHT Teil dieses Briefs.** Sie wird nur als optionaler, gequeuter „Deep-Scan" vorgesehen (`renderMode: 'headless'`), falls Stufe A leer ausgeht (SPA ohne OG-Tags). Interface so bauen, dass Stufe B später ohne Bruch andocken kann — aber **jetzt nicht implementieren**.

**Begründung:** Serverless-Deploy (Vercel) + vorhandene Provider-Abstraktion + vorhandene Queue. Chromium im Request-Pfad = fragiler, langsamer Deploy. `og:image` liefert in >90 % der Fälle ein repräsentatives Markenbild für die Vision-Analyse.

---

## 3. Aufgaben

### 3.1 Service: `packages/services/src/brandDna.ts`

Neues Modul im Stil von `ingestion.ts`. Zwei Verantwortlichkeiten, sauber getrennt:

```ts
// packages/services/src/brandDna.ts
import * as cheerio from 'cheerio';
import type { Moodboard, Color, BoardFonts } from '@pronoia/domain';
import type { VisionProvider, ReasoningProvider } from '@pronoia/ai';

export interface ExtractedSiteData {
  url: string;
  title: string;
  description: string;
  ogImageUrl?: string;
  faviconUrl?: string;
}

export interface BrandDnaAnalysis {
  description: string;      // 1–2 Sätze Marken-Essenz
  brandStrategy: string;    // kurzer strategischer Take
  palette: Color[];         // aus Vision, { hex, name?, role? }
  fonts: BoardFonts;        // { title, subheading, caption } — Font-*Namen*, nicht Klassen
  voiceTone: string;
}

/** Stufe A: HTML holen + Meta/OG/Favicon parsen. Kein Browser, serverless-safe. */
export async function scrapeSiteLightweight(url: string): Promise<ExtractedSiteData> {
  const res = await fetch(url, { headers: { 'user-agent': 'PronoiaBrandDNA/1.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  const abs = (v?: string) => (v ? new URL(v, url).href : undefined);
  return {
    url,
    title: $('meta[property="og:title"]').attr('content') || $('title').text().trim(),
    description:
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') || '',
    ogImageUrl: abs($('meta[property="og:image"]').attr('content')),
    faviconUrl: abs($('link[rel~="icon"]').attr('href')) ?? abs('/favicon.ico'),
  };
}

/** Analyse über die Provider-Registry — KEINE direkten SDK-Calls. */
export async function analyzeBrandDna(
  site: ExtractedSiteData,
  deps: { vision: VisionProvider; reasoning: ReasoningProvider },
): Promise<BrandDnaAnalysis> {
  let visionRaw = '';
  const imgUrl = site.ogImageUrl ?? site.faviconUrl;
  if (imgUrl) {
    const buf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
    visionRaw = await deps.vision.analyzeImage(
      buf,
      'Extract the brand palette (as hex), the perceived typography style (title/subheading/caption font feel) and the overall mood. Return concise JSON.',
    );
  }

  const reasoning = await deps.reasoning.generateReasoning(
    `Brand: ${site.title} — ${site.description}\nVision analysis: ${visionRaw}\n` +
      `Derive: a 1-2 sentence brand essence, a short brand strategy, a voice tone.`,
  );

  // visionRaw defensiv parsen (Modell liefert nicht garantiert valides JSON).
  const parsed = safeParseVision(visionRaw);
  return {
    description: reasoning.conclusion,
    brandStrategy: reasoning.recommendations.join(' '),
    palette: parsed.palette,
    fonts: parsed.fonts,
    voiceTone: reasoning.observation,
  };
}

/** Vollständiges Moodboard (draft) bauen — inkl. Entity-Spine-Pflichtfeldern. */
export function buildMoodboardFromDna(
  site: ExtractedSiteData,
  dna: BrandDnaAnalysis,
  ctx: { workspaceId: string; now?: Date },
): Moodboard {
  const now = ctx.now ?? new Date();
  const id = `moodboard-${now.getTime()}`;
  return {
    id,
    workspaceId: ctx.workspaceId,
    type: 'moodboard',
    title: site.title || site.url,
    metadata: { importedFrom: site.url },
    createdAt: now,
    updatedAt: now,
    boardType: 'website_branding',
    client: (site.title.split(/[-|·—]/)[0] ?? site.title).trim(),
    subtitle: site.description.slice(0, 100),
    note: `Imported from ${site.url}`,
    description: dna.description,
    tags: ['imported', 'brand-dna'],
    palette: dna.palette,
    fonts: dna.fonts,
    status: 'draft',
    sections: [
      {
        id: `section-brand-${now.getTime()}`,
        title: 'Brand DNA Overview',
        items: [
          { id: `item-strategy-${now.getTime()}`, kind: 'text', ratio: '16:9',
            label: 'Brand Strategy', caption: dna.brandStrategy },
        ],
      },
    ],
    notes: `Scraped ${now.toISOString()} · voice: ${dna.voiceTone}`,
  };
}
```

**Regeln für 3.1:**
- `fonts` **muss** `{ title, subheading, caption }` mit echten Font-Namen sein — niemals ein `string[]`. Fallback: `{ title: 'Inter', subheading: 'Inter', caption: 'Inter' }`.
- `safeParseVision` defensiv: bei Parse-Fehler leere `palette: []` und Font-Fallback, **kein throw**.
- Keine Provider selbst instanziieren — sie kommen per `deps` rein (Testbarkeit + Registry-Auswahl bleibt beim Controller).

### 3.2 Provenance-Relationship (Entity-Spine-Konformität)

Zusätzlich zum Moodboard ein `research`-Entity (Quelle) erzeugen und verknüpfen:

- `research`-Entity: `{ type:'research', title: site.title, metadata:{ sourceUrl: site.url } }`
- `Relationship`: `{ type:'derived_from', sourceId: moodboard.id, targetId: research.id }`

So bleibt nachvollziehbar, **woher** die DNA stammt — konsistent mit dem Entity+Relationship-Muster aus Step 2.

### 3.3 Controller: `apps/api/src/controllers/brandDna.ts`

```ts
import { Router } from 'express';
import { scrapeSiteLightweight, analyzeBrandDna, buildMoodboardFromDna } from '@pronoia/services';
// Provider aus der Registry ziehen (dieselbe Auswahl-Logik wie thinking.ts).

export const brandDnaRouter = Router();

brandDnaRouter.post('/extract', async (req, res) => {
  const { url, workspaceId } = req.body ?? {};
  if (!url || !workspaceId) return res.status(400).json({ error: 'url and workspaceId required' });
  try {
    const site = await scrapeSiteLightweight(url);
    const dna = await analyzeBrandDna(site, { vision, reasoning });   // Provider aus Registry
    const moodboard = buildMoodboardFromDna(site, dna, { workspaceId });
    res.json({ moodboard /*, research, relationship */ });
  } catch (e: any) {
    res.status(502).json({ error: e?.message ?? 'Brand DNA extraction failed' });
  }
});
```

### 3.4 Router registrieren (WIRD im Plan oft vergessen)

`apps/api/src/main.ts`:

```ts
import { brandDnaRouter } from './controllers/brandDna.js';
app.use('/api/v1/brand-dna', brandDnaRouter);
```

### 3.5 Frontend-Hook + UI

- `apps/web/src/hooks/useBrandDna.ts`: `extractFromUrl(url)` → `POST /api/v1/brand-dna/extract`, hält `{ loading, error, preview }`.
- In `MoodboardsView`: dezenter „**Import Website DNA**"-Input (URL-Feld + Button) im Erstellungs-/Detail-Panel. Ergebnis erst als **Draft-Preview**, den der Creator bestätigt (See → Do), **kein** Auto-Insert ohne Bestätigung.

### 3.6 Dependencies

- `cheerio` (Stufe A). `fetch` ist ab Node 18 global — **kein** `undici` nötig.
- **KEIN** `playwright` in diesem Schritt. (Nur als Kommentar/TODO für Stufe-B-Queue vermerken.)

---

## 4. Akzeptanzkriterien

- [ ] `POST /api/v1/brand-dna/extract` mit `{ url, workspaceId }` liefert ein **valides `Moodboard`** (alle Pflichtfelder inkl. Entity-Spine, `fonts` als `BoardFonts`, `palette` als `Color[]`).
- [ ] Kein Playwright/Chromium wird im Request-Pfad gestartet.
- [ ] Vision/Reasoning laufen ausschließlich über die `@pronoia/ai`-Registry (keine direkten SDK-Imports in `services`).
- [ ] `research`-Entity + `Relationship('derived_from')` werden erzeugt (Provenance).
- [ ] Ungültige/ nicht erreichbare URL → sauberer `4xx/5xx`-Fehler, **kein** Crash.
- [ ] `npx tsc --noEmit` (domain, ai, services, apps/api) grün; `vite build apps/web` grün.
- [ ] UI: URL-Import erzeugt einen **Draft-Preview**, kein automatisches Speichern ohne Bestätigung.

---

## 5. Explizit NICHT in diesem Brief

- Playwright/Headless-„Deep-Scan" (→ Folge-Brief: Stufe-B-Queue).
- Asset-/Bildgenerierung aus der DNA (DALL·E/Midjourney-Teil von Open-Pomelli).
- Persistenz-Schema-Änderungen an Supabase (bestehende Tabellen bleiben unangetastet).

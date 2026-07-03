# ANTIGRAVITY — TASK BRIEF: Step 3

**(A) Brand-DNA-Import-Upgrade  +  (B) `EntityStore`-Adapter über die bestehenden Supabase-Tabellen**

> Teil des Strangler-Fig-Umbaus zum typisierten **Entity-Spine**.
> Vorgänger: Step 1 (Entity-Spine) ✅ · Brand-DNA 2a/2b/2c ✅ (Scraping + Live-Mistral/Pixtral-Vision) · Step 3 Slice 1 ✅ (Relationships hinter dem Store).
> **Dieser Brief enthält alles, was jetzt ansteht:** zuerst den Import qualitativ reparieren (A), dann die Persistenz-Naht fertig migrieren (B).

---

## 0. Grundregeln (NICHT verletzen)

| Regel | Beschreibung |
|---|---|
| **Strangler-Fig** | Laufende App bricht nie. Nach jedem Slice: `npx tsc -p apps/web/tsconfig.app.json --noEmit` **und** `vite build apps/web` grün, Runtime ohne Console-Fehler. |
| **Hook-APIs stabil** | Öffentliche Rückgaben von `useMoodboards`/`useRelationships`/`useWorkspace` bleiben identisch — Consumer werden NICHT angefasst. Nur die Persistenz wandert hinter den Store. |
| **Provider-Abstraktion** | Vision/Reasoning ausschließlich über `@pronoia/ai` (`resolveProvider`). Keine direkten SDK-Calls in Services. Kein Key im Client. |
| **localStorage-Fallback bleibt** | Supabase kann 404en (siehe §B.4). Jeder Store-Pfad offline-first. |
| **Anti-Patterns** | Keine Dashboards/Scores/Streaks. Import = stiller *See → Do*-Schritt mit Draft-Bestätigung. |

---

## Aktueller Stand (Fakten)

- **Backend** liefert echte DNA: `packages/services/src/brandDna.ts` (`scrapeSiteLightweight` → `analyzeBrandDna` → `buildMoodboardFromDna`), Provider live via `packages/ai/src/factory.ts` (`resolveProvider`, Key aus `apps/api/.env` → `MISTRAL_API_KEY`, Fallback = Mocks).
- **Frontend**: `apps/web/src/hooks/useBrandDna.ts` + Import-Panel in `apps/web/src/views/MoodboardsView.tsx` (URL → Draft-Preview → `confirmImport` → `addMoodboard`).
- **EntityStore**: Port `packages/domain/src/store.ts`; Adapter `apps/web/src/lib/entityStore.ts` (Relationships live, Entities = Slice 2); `useRelationships` delegiert bereits.

---

# TEIL A — IMPORT-UPGRADE (zuerst, das ist das „katastrophal")

**Symptom:** Erkennung läuft (echte Farben werden extrahiert), aber das *erzeugte Moodboard* ist unbrauchbar: Firmenname „Online", eine fast leere Sektion, Schriften laden nicht, `og:image` verworfen. Sechs konkrete Fixes — alle in `buildMoodboardFromDna` (`packages/services/src/brandDna.ts`), außer A5 (Web).

### A1 — Firmenname aus der Domain, nicht aus dem Titel
Aktuell: `client = site.title.split(/[-|·—]/)[0]` → aus „Online-Bezahldienst … | Stripe" wird **„Online"**.
Fix: Marke aus dem Hostname ableiten.
```ts
function brandFromUrl(url: string, title: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1); // stripe.com → "Stripe"
  } catch {
    return (title.split('|').pop() ?? title).trim();
  }
}
```
`client: brandFromUrl(site.url, site.title)`.

### A2 — Palette als echte Farb-Items (nicht nur Detail-Punkte)
Aktuell landet die Palette nur in `moodboard.palette` (winzige Punkte im Detail-Panel). Sie muss als sichtbare `color`-Items in eine Sektion — analog zu `templateSections('website_branding')` in `useMoodboards.ts`.
```ts
const paletteItems: MoodboardItem[] = dna.palette.map((c, i) => ({
  id: `mi-col-${now.getTime()}-${i}`,
  kind: 'color', ratio: '1:1',
  label: c.name ?? c.hex, color: c.hex, caption: c.role ?? '',
}));
```

### A3 — `og:image` als Bild-Item verwenden (statt es wegzuwerfen)
`site.ogImageUrl` wird für die Vision-Analyse geladen und dann **verworfen**. Es ist das repräsentativste Markenbild — als `image`-Item aufnehmen.
```ts
const imageItems: MoodboardItem[] = site.ogImageUrl ? [{
  id: `mi-img-${now.getTime()}`, kind: 'image', ratio: '16:9',
  label: 'Brand Image', imageUrl: site.ogImageUrl, source: site.url,
}] : [];
```

### A4 — Reichere Sektionen bauen
Die eine „Brand DNA Overview"-Textsektion durch eine sinnvolle Struktur ersetzen:
```ts
sections: [
  { id: `sec-overview-${now.getTime()}`, title: 'Overview',
    items: [...imageItems,
      { id:`mi-strategy-${now.getTime()}`, kind:'text', ratio:'16:9', label:'Brand Strategy', caption: dna.brandStrategy },
      { id:`mi-voice-${now.getTime()}`,    kind:'text', ratio:'16:9', label:'Voice & Mood',    caption: dna.voiceTone },
    ] },
  { id: `sec-palette-${now.getTime()}`, title: 'Palette & Type', items: paletteItems },
]
```

### A5 — KI-Fonts auf ladbare Fonts mappen (Web)
`loadFont` lädt **nur** `FONT_OPTIONS` (`apps/web/src/lib/fonts.ts`). Die KI rät „Helvetica Neue/Futura" → wird nie geladen. Mapping gehört in die Web-Schicht (Services kennt `FONT_OPTIONS` nicht). In `useBrandDna` (oder `confirmImport`) vor dem Speichern:
```ts
import { FONT_OPTIONS } from '../lib/fonts.js';
const DEFAULT: BoardFonts = { title:'Anton', subheading:'Archivo', caption:'Space Grotesk' };
const nearest = (guess?: string, fallback='Inter') =>
  FONT_OPTIONS.find(f => f.toLowerCase() === (guess ?? '').toLowerCase()) ?? fallback;
mb.fonts = {
  title: nearest(mb.fonts.title, DEFAULT.title),
  subheading: nearest(mb.fonts.subheading, DEFAULT.subheading),
  caption: nearest(mb.fonts.caption, DEFAULT.caption),
};
mb.notes += ` · AI fonts: ${dna.fonts.title}/${dna.fonts.subheading}/${dna.fonts.caption}`; // raw guess erhalten
```

### A6 — `subtitle` nicht mitten im Wort abschneiden
Aktuell `description.slice(0,100)`. Am Wortende clampen:
```ts
subtitle: site.description.length > 100
  ? site.description.slice(0, 100).replace(/\s+\S*$/, '') + '…'
  : site.description,
```

### A-Akzeptanz
- [ ] Import von `stripe.com` → `client` = „Stripe", Board hat ein Bild-Item, 4–5 Farb-Items, Strategy/Voice-Text, geladene Fonts.
- [ ] `og:image` sichtbar im Board (nicht nur als Vision-Input).
- [ ] Kein mitten-im-Wort abgeschnittener Untertitel.
- [ ] Bei fehlendem `og:image`/Key: sauberer, nicht-leerer Draft (Fallback-Palette, Default-Fonts).

---

# TEIL B — ENTITYSTORE-MIGRATION (die generell nötigen Schritte)

### B.1 — Slice 2: `useMoodboards` → Store
- Entity-Methoden des Adapters (`apps/web/src/lib/entityStore.ts`) für `type === 'moodboard'` implementieren: `list/get/upsert/remove` → Tabelle `moodboards`.
- Die vorhandene `normalize()`/`boardToRow()`-Logik aus `useMoodboards.ts` **in den Adapter verschieben** (nicht duplizieren); der Hook behält State + Templates/Seed.
- Andere Entity-Typen weiter explizit `NotImplemented` (dokumentiert).

### B.2 — Slice 3: `WorkspaceContext` → Store (größter, zuletzt)
- `world_nodes`/`world_edges`/`pipeline_cards` hinter den Store ziehen. **Realtime-Subscriptions bleiben** (Store liefert Mapper; Subscription bleibt im Context).
- Nicht gleichzeitig den `card:{id}`-Mirror-Hack anfassen (eigener Schritt).

### B.3 — Provenance freischalten (Nebenprodukt von Slice 2)
Sobald `entityStore.upsert()` für Entities läuft, die in 2b aufgeschobene Brand-DNA-Provenance nachziehen — in `confirmImport`:
- `research`-Entity `upsert`en (`{ type:'research', title: site.title, metadata:{ sourceUrl } }`),
- `entityStore.link(moodboard.id, research.id, 'derived_from')`.

### B.4 — Infra-BLOCKER: fehlende Tabellen
**`moodboards` und `relationships` existieren im Supabase-Projekt NICHT** (REST liefert `404`) → beide persistieren aktuell nur nach localStorage. Vor/parallel zu Slice 2:
- Migration im `supabase/`-Verzeichnis: Tabellen `moodboards` und `relationships` mit den Spalten aus `boardToRow()` / `relToRow()` (`workspace_id`, `source_id`/`target_id`, `type`, `metadata`, `board_type`, `client`, `subtitle`, `note`, `fonts`, `sections`, `color_palette`, `tags`, `status`, `notes`, `created_at`, `updated_at`).
- RLS analog `world_nodes` (Single-User-Workspace `main-space`).
- Optional: Import auch **server-seitig** persistieren (der Controller könnte das gebaute Moodboard direkt schreiben), sobald die Tabelle steht.

### B-Akzeptanz
- [ ] Persistenz-/Row-Mapping-Logik nur noch im Adapter, nicht in den Hooks.
- [ ] Öffentliche Hook-APIs unverändert; Realtime nach Slice 3 unverändert.
- [ ] Nach der Migration: Moodboards/Relationships persistieren echt nach Supabase (Fallback bleibt Sicherheitsnetz).
- [ ] `tsc --noEmit` (domain, apps/web) + `vite build` grün.

---

## Reihenfolge (empfohlen)

1. **Teil A** (Import-Upgrade) — sofort sichtbarer Wert, rein additiv, kein Architektur-Risiko.
2. **B.4** (Migration `moodboards`/`relationships`) — hebt den Persistenz-Blocker.
3. **B.1** (Slice 2, Moodboards) → **B.3** (Provenance) → **B.2** (Slice 3, WorkspaceContext).

## Explizit NICHT in Step 3
- Kollaps auf eine einzige `entities`-Tabelle (später, nur wenn es sich auszahlt).
- Entfernen des `card:{id}`-Mirror-Hacks (Roadmap-Step 2, eigener Brief).
- API-vermittelte Writes (später pro Typ, Port bleibt gleich).
- `packages/identity` + Learning-Loop (Roadmap-Step 4).

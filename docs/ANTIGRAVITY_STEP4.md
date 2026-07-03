# ANTIGRAVITY — TASK BRIEF: Step 4

**`packages/identity` + der Learning-Loop (Moodboard → BrandIdentity → Analytics → Gewichts-Update)**

> Der strategische Kern („Moat"): Identity/Brand als erststrangige World-Model-Schicht **plus** der geschlossene Lernkreis, der aus Performance-Daten lernt, welche Marken-Elemente funktionieren.
> Vorgänger: Step 1 (Entity-Spine) ✅ · Brand-DNA 2a–2c ✅ · Step 3 (EntityStore) 🚧 Slice 1.
> **Abhängigkeit:** Der reine Engine (Slice 1) ist dependency-frei baubar. **Persistenz (Slice 3) braucht Step 3** (EntityStore + Tabellen).

---

## 0. Grundregeln (NICHT verletzen)

| Regel | Beschreibung |
|---|---|
| **Strangler-Fig** | Laufende App bricht nie. Nach jedem Slice: `npx tsc --noEmit` (betroffene Pakete) + `vite build apps/web` grün. |
| **Pure Core, IO außen** | Der Identity-Engine sind **pure Funktionen** über Domain-Typen (`BrandIdentity`, `Moodboard`, `ContentMetrics`, `Relationship`). Kein Supabase/Fetch im Engine — Daten kommen als Argumente rein. |
| **Provider-Abstraktion** | KI-gestützte Synthese (Voice/Hooks) nur über `@pronoia/ai` (`resolveProvider`, live Mistral/Pixtral, Mock-Fallback). Keine SDK-Calls im Paket. |
| **Typed, nicht untyped** | `BrandIdentity extends Entity` bleibt stark getippt. Gewichte sind echte Felder, kein `metadata`-Bag. |
| **Anti-Dashboard** | Der Loop erzeugt **bessere Empfehlungen/Defaults**, KEINE Scores/Streaks/Leaderboards. Ausgabe ist *See → Do*, nicht *Track*. |

---

## 1. Ausgangspunkt (Fakten)

- **Ziel-Entity existiert:** `BrandIdentity` in `packages/domain/src/entity.ts` — `colors: Color[]`, `typography: Typography`, `voice: Voice { tone, doList, dontList }`, `thumbnail?: ThumbnailStyle`, `motion?: MotionStyle`, `hooks: string[]`, `moodboardIds: string[]` („identity is fed by moodboards").
- **Loop-Input existiert:** `ContentMetrics` (`views`, `clickThroughRate`, `viralScore`, `subscriberGain`, …) hängt an `ContentPipeline.metrics` (`packages/domain/src/models.ts`).
- **Graph-Kanten existieren:** `RelationshipType` hat `styled_by` (Pipeline-Card → Moodboard/Identity) und `produces` (Card → veröffentlichtes Video/Asset). Das ist der Attributionspfad Performance → Identity.
- **⚠️ Namenskollision:** `packages/cognition/src/identity.ts` exportiert bereits `IdentityEngine` — das ist **NodeIdentity** (semantische Knoten-Identität), NICHT BrandIdentity. Neues Paket verwendet einen eigenen Namen: **`BrandIdentityEngine`**.
- **`packages/identity` existiert nicht** → neu anlegen (Workspaces-Muster wie `packages/ai`: `package.json` mit `@pronoia/domain` (+ `@pronoia/ai` devDep für Typen), `tsconfig.json`, `src/index.ts`).

---

## 2. Aufgaben (Slices)

### Slice 1 — Paket + Identity-Synthese (dependency-frei, sofort baubar)
Neu: `packages/identity/src/synthesis.ts`

Deterministische Aggregation `Moodboard[] → Partial<BrandIdentity>`, plus optionale KI-Anreicherung:
- **Farben:** Paletten der Moodboards zusammenführen, nach Häufigkeit/Rolle ranken → `colors`.
- **Typografie:** `fonts` der Moodboards → `typography { heading, body, accent }`.
- **Voice/Hooks (KI):** aus `description`/`notes`/Text-Items der Moodboards via `resolveProvider(...).generateReasoning` → `voice` + initiale `hooks[]`. JSON-Schema erzwingen, defensiv parsen (wie `safeParseVision`).
```ts
export class BrandIdentityEngine {
  /** Pure: fasst die Moodboards zu einer Identity-Basis zusammen. */
  static synthesize(moodboards: Moodboard[], deps?: { reasoning?: ReasoningProvider }): Promise<Partial<BrandIdentity>>;
}
```
- `moodboardIds` = ids der Input-Moodboards. Verknüpfung später als `Relationship('derived_from')`/`styled_by`.

### Slice 2 — Learning-Loop: Attribution + Gewichts-Update (pure)
Neu: `packages/identity/src/learning.ts`

Kern des Moats — mappt Performance zurück auf Identity-Elemente über den Graph:
1. **Attribution:** Für jede veröffentlichte `ContentPipeline` mit `metrics` den Pfad `card —styled_by→ identity` und `card —produces→ asset` folgen. So weiß man, welche Identity welche `ContentMetrics` erzeugt hat.
2. **Signal:** normalisierter Performance-Score pro Stück (z. B. `viralScore` + gewichtete `clickThroughRate`/`subscriberGain`).
3. **Gewichts-Update:** Identity-Elemente re-ranken:
   - `hooks[]` nach Ø-Performance der Stücke, die den Hook nutzten (bestperformende Hooks nach oben).
   - `thumbnail`/`motion`-Notizen mit dem, was messbar performt, anreichern.
   - optionale `weight`-Felder (0..1) pro Hook/Style — **neue getippte Felder**, kein metadata-Bag.
```ts
export interface IdentityLearningInput {
  identity: BrandIdentity;
  cards: ContentPipeline[];          // published, mit metrics
  relationships: Relationship[];     // styled_by / produces
}
export class BrandIdentityEngine {
  static learn(input: IdentityLearningInput): BrandIdentity; // pure, gibt aktualisierte Identity zurück
}
```
- **Kalt-Start-sicher:** ohne `metrics` → Identity unverändert zurück (kein Rauschen).

### Slice 3 — Persistenz + UI-Anbindung (NACH Step 3)
- `BrandIdentity` über den `EntityStore` (`type: 'identity'`) speichern — Entity-Methoden aus Step 3 Slice 2. Tabelle `brand_identities` (oder generische `entities`, falls Step 3 dahin kollabiert).
- Web: aus einem/mehreren Moodboards „Identity ableiten" (`synthesize`), als Draft bestätigen (See → Do). Content-Empfehlungen nutzen die (gelernte) Identity als Default-Stil — **kein** separates Analytics-Dashboard.
- Loop-Trigger: nach Metrik-Update (`updateCard` mit `metrics`) `learn(...)` laufen lassen und die Identity aktualisieren.

---

## 3. Der Moat (warum das der Kern ist)

Der geschlossene Kreis ist der Verteidigungsgraben:
```
Moodboards → BrandIdentity (synthesize)
     → styling von Content (styled_by)
        → Veröffentlichung (produces) → ContentMetrics
           → Attribution zurück auf Identity-Elemente
              → Gewichts-Update (learn)
                 → bessere Defaults/Hooks fürs nächste Stück ↺
```
Jede Iteration macht die Identity-gestützten Empfehlungen datengetriebener. Das ist nicht kopierbar ohne die Nutzungshistorie.

---

## 4. Akzeptanzkriterien

- [ ] `packages/identity` baut (`tsc`), exportiert `BrandIdentityEngine`; **keine** Kollision mit `cognition`'s `IdentityEngine`.
- [ ] `synthesize(moodboards)` liefert eine plausible `Partial<BrandIdentity>` (Farben/Fonts deterministisch, Voice/Hooks via Provider mit Mock-Fallback).
- [ ] `learn(input)` re-rankt `hooks[]` nach Performance und ist kalt-start-sicher (ohne metrics unverändert).
- [ ] Engine ist **pure** (keine IO-Imports); Unit-testbar mit Fixtures.
- [ ] Slice 3 erst nach Step 3; Persistenz über `EntityStore`, kein direkter Supabase-Call im Paket.

---

## 5. Explizit NICHT in Step 4

- Kein Analytics-Dashboard / keine Scores-UI (Anti-Pattern).
- Kein echtes Social-API-Ingest der Metriken (separater Schritt; hier kommen `ContentMetrics` als gegeben rein).
- Keine Persistenz vor Step 3 (Slice 1+2 sind pure und stehen für sich).
- Package-Reorg (Roadmap-Step 5) bleibt außen vor.

# ANTIGRAVITY — TASK BRIEF: Step 2

**Moodboard → erste echte Domain-Entity + Relationship-Layer (`styled_by`)**

> Teil des Umbaus von Pronoia zu einem Cognitive OS mit typisiertem **Entity-Spine**.
> Vorgänger: Step 1 (Entity-Spine in `packages/domain/src/entity.ts`) ist fertig.

---

## 0. Grundregeln (NICHT verletzen)

| Regel | Beschreibung |
|---|---|
| **Strangler-Fig** | Die laufende App darf zu KEINEM Zeitpunkt brechen. Nach jedem Teilschritt muss gelten: `npx tsc -p apps/web/tsconfig.app.json --noEmit` **und** `npx vite build apps/web` grün. |
| **Typed, nicht untyped** | Entities bleiben stark typisiert. KEIN Kollaps auf `Entity { type; metadata: Record<string,unknown> }` als Speichermodell. **Relationships** sind erststrangige Records — sie sind das, was vereinheitlicht, nicht ein LCD-Schema. |
| **Kein Big-Bang-DB-Rewrite** | Bestehende Supabase-Tabellen (`world_nodes`, `world_edges`, `pipeline_cards`) bleiben unangetastet. |
| **Mirror-Hack bleibt** | Der `card:{id}`-Mirror in `WorkspaceContext.tsx` bleibt in Step 2 unangetastet (→ Step 2b). |
| **Anti-Patterns** | Keine Dashboards/Scores/Streaks/Chatbot-UI. |

---

## 1. Aktueller Stand (Ausgangspunkt)

- **Domain** hat `Moodboard` (schlank) in `packages/domain/src/entity.ts`.
- **Web** hat eine **reichere** Moodboard-Struktur in `apps/web/src/hooks/useMoodboards.ts`
  (`boardType`, `client`, `subtitle`, `note`, `fonts`, `sections` mit `ratio`-Items) — das ist die **Drift**, die Step 2 auflöst.
- `apps/web/src/views/MoodboardsView.tsx` nutzt die Hook-Typen, **nicht** die Domain-Typen.
- Der `styled_by`-Link existiert bisher nur als loser String `attachedCardId`.

**Ziel:** Das Moodboard wird zur ersten echten Domain-Entity, und der Card-Link wird eine echte `Relationship('styled_by')`. Damit ist das Entity+Relationship-Muster einmal sauber etabliert und generalisierbar.

---

## 2. Aufgaben

### 2.1 Domain-`Moodboard` mit der reichen Struktur abgleichen
Datei: `packages/domain/src/entity.ts`

Neue Typen ergänzen und `Moodboard`/`MoodboardItem` auf **exakt** diese Zielform bringen:

```ts
export type Ratio = '1:1' | '9:16' | '16:9';
export type BoardType =
  | 'video_brand_deck' | 'website_branding' | 'short_form' | 'writing' | 'custom';
export interface BoardFonts { title: string; subheading: string; caption: string; }

export interface MoodboardItem {
  id: string;
  kind: MoodItemKind;         // 'image' | 'color' | 'text'   (Diskriminator heißt kanonisch `kind`)
  ratio: Ratio;               // NEU
  label: string;
  imageUrl?: string;
  color?: string;
  caption?: string;
  source?: string;
  tags?: string[];
  score?: number;             // Reflection-Loop-Signal
}

export interface MoodSection { id: string; title: string; items: MoodboardItem[]; }

export interface Moodboard extends Entity {
  type: 'moodboard';
  boardType: BoardType;       // NEU
  client: string;             // NEU (großer Header-Name)
  subtitle: string;           // NEU ("what it is for")
  note: string;               // NEU
  description: string;
  tags: string[];             // NEU
  palette: Color[];           // Hex-Strings der Web-App → { hex } mappen
  fonts: BoardFonts;          // ersetzt das alte `typography?`
  status: 'draft' | 'active' | 'archived';
  attachedCardId?: string;    // Bequemlichkeits-Spiegel der styled_by-Relationship
  sections: MoodSection[];    // ersetzt das flache `items`
  notes: string;
}
```

- **Datums-Konvention festlegen:** In-Memory `Date`, at-rest ISO-`string`. Mapper an der Persistenzgrenze.
- Danach: `npm run build --workspace packages/domain`.

### 2.2 Relationship-Store einführen
Neu: `apps/web/src/hooks/useRelationships.ts` — Muster **analog** `useMoodboards`
(localStorage-first + best-effort Supabase, Domain-`Relationship`-Typ).

API:
```ts
addRelationship(sourceId, targetId, type: RelationshipType): string
removeRelationship(id): void
relationshipsFor(entityId): Relationship[]
findRelationship(sourceId, targetId, type): Relationship | undefined
```

SQL: `supabase/migrations/0002_relationships.sql`
Spalten: `id, workspace_id, source_id, target_id, type, weight, metadata jsonb, created_at`.
(RLS + Policy analog `0001_moodboards.sql`.)

### 2.3 `useMoodboards` auf Domain-Typen umstellen
Datei: `apps/web/src/hooks/useMoodboards.ts`
- `Moodboard`, `MoodboardItem`, `MoodSection`, `BoardType`, `BoardFonts`, `Ratio` aus `@pronoia/domain` importieren; lokale Duplikate entfernen.
- **Rename** im Web-Code: Item-Diskriminator `type` → `kind`; `colorPalette` → `palette` (als `Color[]`). Betroffen: `useMoodboards.ts`, `MoodboardsView.tsx`. (`BOARD_TYPES`, Templates, Seed, `normalize()` mitziehen.)
- Persistenz-Mapper an `Date`↔ISO anpassen.
- `MoodboardsView.tsx`-Importe entsprechend nachziehen (funktionale Parität behalten: Deck-Header, Fonts, Sections, Ratio-Tiles, Add/Delete, Persistenz).

### 2.4 `styled_by`-Relationship verdrahten
- Beim Setzen von **„Attached To"** im Details-Panel: `styled_by`-Relationship
  `(source = moodboardId, target = cardId)` über den Store erzeugen/aktualisieren
  (zusätzlich zum Spiegel-Feld `attachedCardId`). Beim Leeren: Relationship entfernen.
- **Pipeline-Seite** (`apps/web/src/views/ContentPipelineView.tsx`, Workspace-Panel):
  verknüpftes Moodboard anzeigen (Name; Klick öffnet Moodboards-View mit diesem Board aktiv).
  Navigations-Callback analog zur bestehenden Brain→Editor-Kette in `App.tsx`.

### 2.5 Step 2b (NUR markieren, NICHT jetzt umsetzen)
- `card:{id}`-Mirror in `WorkspaceContext.tsx` durch echte `has_view`-Relationships ersetzen.
  Separater Schritt, um den funktionierenden Graph nicht zu destabilisieren.

---

## 3. Acceptance Criteria

- [ ] `tsc --noEmit` und `vite build apps/web` grün.
- [ ] `packages/domain` gebaut; kein Divergenz mehr — die Web-App importiert `Moodboard` aus `@pronoia/domain`.
- [ ] Moodboards-View unverändert funktionsfähig (Header/Client/Subtitle/Note, Font-Picker + dynamisches Laden, Sections, Ratio-Tiles 9:16/1:1/16:9, Board-Types, Persistenz).
- [ ] „Attached To" erzeugt einen sichtbaren `styled_by`-Link, der auf der zugehörigen Pipeline-Karte erscheint; Entfernen löscht ihn.
- [ ] localStorage-Fallback funktioniert OHNE `relationships`-Tabelle; mit ausgeführtem SQL synchronisiert es zu Supabase.

## 4. Verifikation (manuell im Preview)

1. Moodboard „Attached To" auf eine Karte setzen → in der Pipeline-Karte erscheint das Moodboard.
2. Reload → Verknüpfung bleibt bestehen (Persistenz).
3. Board-Type wechseln, Font ändern, Tile hinzufügen → alles persistiert.

## 5. Danach (Ausblick, nicht Teil von Step 2)

`packages/identity` + Learning-Loop (Moodboard → BrandIdentity → Analytics), dann `EntityStore`-Adapter (Step 3) und Package-Reorg (Step 5).
Referenz: `~/.claude/.../memory/creator-os-architecture.md`.

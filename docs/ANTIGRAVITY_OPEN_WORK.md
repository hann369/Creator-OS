# ANTIGRAVITY — TASK BRIEF: Offene Phasen & Schritte

**Konsolidierter Backlog über alle vier Nummerierungen hinweg. Stand: 2026-07-10.**

> Dieses Dokument ersetzt das Zusammensuchen aus `ANTIGRAVITY_STEP2/3/4.md` (historisch, größtenteils
> abgearbeitet) und den vier Roadmaps. Es beschreibt **nur, was noch offen ist** — plus den
> verifizierten Ist-Stand, damit nichts doppelt gebaut wird.

---

## 0. Grundregeln (NICHT verletzen)

| Regel | Beschreibung |
|---|---|
| **Strangler-Fig** | Die App ist **live und monetarisiert**. Sie bricht nie. Nach jedem Slice: `npx tsc -p apps/web/tsconfig.app.json --noEmit` **und** `npx vite build apps/web` **und** `npm test` grün. |
| **Öffentliche APIs stabil** | Rückgaben von `useWorkspace`/`useMoodboards`/`useRelationships`/… bleiben identisch. Nur die Innereien wandern. Consumer werden nicht angefasst, außer der Slice sagt es ausdrücklich. |
| **Im Browser verifizieren** | `tsc` + Tests fangen die teuersten Fehler dieser Codebase NICHT. Zwei Beispiele, beide real passiert: (a) `isLoading = !(a.useLoaded() && b.useLoaded())` — `&&` kürzt ab, Hook-Reihenfolge kippt, weiße Seite. (b) Ein `entityStore.link()` schrieb an der gemounteten View vorbei. Beides nur durch Klicken gefunden. **Jeder Slice endet mit einem Klicktest** (Dev-Server, Testaccount, betroffene View, Konsole leer). |
| **Pure Core, IO außen** | Logik in dependency-freie Module (`packages/*/src`, `apps/web/src/store/reducers.ts`), IO dahinter über Ports. Nur so ist es mit `node --test` testbar. |
| **Provider-Abstraktion** | KI ausschließlich über `@pronoia/ai` (`resolveProvider`). Keine SDK-Calls in Services, kein Key im Client. |
| **Offline-First bleibt** | Jeder Store-Pfad hat einen localStorage-Spiegel. `Repository.list()` **rejectet** bei Unerreichbarkeit — es darf NIE `[]` liefern, sonst löscht die Collection ihren eigenen Spiegel. |
| **Anti-Dashboard** | Keine Scores, Streaks, Leaderboards. Ausgabe ist immer *See → Do*, nicht *Track*. |
| **Deploy ≠ git push** | Das Vercel-Projekt hat **keine Git-Anbindung**. `git push` deployt nichts. Deploy = `npx vercel --prod` aus dem Repo-Root, lädt den **Arbeitsbaum** hoch (auch Uncommittetes). |
| **Prod-DB** | Migrationen und Writes gegen die Live-Supabase (`xposyczkjybgvijxsfpz`) führt **der User** aus. Nie ungefragt. `auth.users` ist als PII gesperrt — User-IDs über `public.*` holen. |

---

## 1. Ist-Stand (verifizierte Fakten, NICHT erneut bauen)

**Fertig:**
- **Phase 0** — Test-Harness: `node --test` + native TS-Type-Stripping, **null Dependencies**. `npm test`, 69 Tests grün.
  Seit `ad5b976` mappt `scripts/ts-resolve-hook.mjs` die NodeNext-Specifier (`./foo.js` → `foo.ts`), d.h.
  **Tests können jetzt beliebige Module importieren**, nicht mehr nur Blattmodule.
- **Phase A, Slice 1+2** — `packages/domain/src/graph.ts`: unifiziertes `Node`/`Edge`-Modell + verlustgeprüfte
  Konverter; `pipelineCardToNode`/`contentMirrorNodeId`/`isContentMirrorNode` kanonisiert.
- **Phase B (komplett)** — eine zentrale State-Schicht. `apps/web/src/store/`: `createStore`, `useStore`,
  pure `reducers`, `collection` (Factory). Alle Hooks + `WorkspaceContext` hängen an je einer
  modulweiten Collection. `store/graph.ts` hält nodes/edges/cards; Realtime bleibt im Context und
  speist die Collections über `insertRemote`/`replaceRemote`/`dropRemote` (schreiben nie zurück).
- **Phase C, Slice 1** — `store/repository.ts` (Port: `list`/`upsert`/`remove` über Rows +
  `KeyValueStorage`), `store/supabaseRepository.ts` (**einziger** Ort im Store-Layer, der Supabase kennt),
  Verdrahtung in `main.tsx` via `setRepository`.
- **Content Intelligence (Ingestion)** — `@pronoia/ingestion` + LibraryView, live und echt: reale
  Transkripte, reale Mistral-Analyse, reale Embeddings, pgvector-Suche (`match_content_entries`).
- **Course Maker** — Phasen 1–3, Stripe live, Buy-Flow e2e verifiziert (Paywall ist echt serverseitig).
- **Telegram-Bot** — `@PronoiaCreatorbot`, live, mit Projekt-Routing.
- **Identity-Loop** — `packages/identity`, See→Do in `ContentPipelineView` geschlossen.

**Wichtige Altlast, die bewusst steht:**
- **Der `card:{id}`-Mirror-Hack ist LOAD-BEARING.** Jede Pipeline-Card besitzt einen deterministischen
  Spiegel-Knoten im World Model. `CognitionView` lässt diesen Knoten **ziehen** und persistiert `x`/`y`
  über `updateNode` → `world_nodes`. Ihn "wegzuoptimieren" (Knoten in-memory ableiten) **löscht
  gespeicherte Positionen**. Siehe Phase A unten.

---

## 2. Offene Phasen

### Phase A (Rest) — Duale Graph-Modelle killen · ⚠️ GATE: vorher mit dem User abstimmen

**Problem:** Zwei parallele Modelle. `WorldNode`/`WorldEdge` (`packages/domain/src/models.ts`) vs.
`Entity`/`Relationship` (`entity.ts`). `graph.ts` hält bereits das unifizierte `Node`/`Edge`, aber
niemand persistiert darüber. `goal` existiert dreifach (world_node-Typ, `GoalEntity`, `goals`-Tabelle).

**Warum riskant:** siehe Mirror-Hack oben. Erst Daten, dann Code.

- **A.3 — Positionsmigration (Voraussetzung).** Card-Positionen von `world_nodes.metadata.{x,y}` auf die
  Card selbst (oder eine eigene `node_positions`-Map) heben. Migration + Backfill schreibt **der User**.
- **A.4 — Ableiten statt spiegeln.** Erst wenn A.3 live ist: Mirror-Knoten in-memory aus den Cards
  ableiten (`pipelineCardToNode`), `world_nodes`-Zeilen für `card:*` löschen.
- **A.5 — Migration auf `Node`/`Edge`.** `CognitionView` + `store/graph.ts` + `entityStore` auf das
  unifizierte Modell umstellen, duale Persistenz abschaffen, `models.ts`-Legacy löschen.

**Akzeptanz:** Positionen überleben nachweislich einen Reload (Spiegel löschen → neu laden → Position da).
Brain/Pipeline/Cognition klickgetestet. Keine `card:`-Zeile mehr in `world_nodes`.

---

### Phase C (Rest) — Repository-Port zu Ende führen

- **C.2 — API-vermittelter Adapter.** Der Port erlaubt einen zweiten Adapter, ohne eine einzige
  Collection anzufassen: `apiRepository` schreibt über `apps/api` (Service-Role, serverseitige
  Validierung) statt über den Anon-Client im Browser. Pro Tabelle umschaltbar einführen, nicht global.
  Vorsicht: `useLibrary` ist bewusst **read-only über RLS** und darf nicht auf `createCollection`
  wandern — ihr Write-Back würde server-only Spalten überschreiben.
- **C.3 — Echter `WorkspaceStore`.** `lib/workspace.ts` hält den aktiven Projekt-Scope in einem
  Modul-Global plus Broadcast. Das funktioniert, ist aber unsichtbar für React-DevTools und nicht
  testbar über die Collection hinaus. In einen `createStore`-basierten Store heben, `getActiveWorkspaceId()`
  als Lesefunktion darüber lassen (Aufrufer bleiben unverändert).
- **C.4 — `SelectionStore`.** Aktuell hält jede View ihr eigenes `selectedNodeId`/`activeBoardId`.
  Cross-View-Navigation ("zeig diese Card im Brain") ist deshalb nicht möglich.

**Akzeptanz:** Kein `supabase`-Import außerhalb von `lib/supabase.ts`, `store/supabaseRepository.ts`,
`AuthContext` und den bewusst read-only Hooks. `collection.test.ts` läuft weiter gegen ein
In-Memory-Repository.

---

### Phase D — Event-/Command-Log

**Problem:** Zwei unverbundene Event-Systeme. Domain-`WorkspaceEvent` (`packages/domain/src/events.ts`)
und der In-Memory-`globalEventBus` (`packages/shared/src/events.ts`) — nicht persistiert, kaum benutzt —
neben Supabase-Realtime. Kein Event-Sourcing, keine Historie, kein Undo.

- **D.1** Tabelle `events` (append-only: `id`, `workspace_id`, `owner_id`, `type`, `payload jsonb`,
  `created_at`). Migration durch den User.
- **D.2** Jede Collection-Mutation (`add`/`update`/`remove`) schreibt zusätzlich ein Event. Der Ort dafür
  ist genau eine Funktion: `commit()` in `store/collection.ts`. Fire-and-forget wie die Upserts.
- **D.3** `globalEventBus` an das Log hängen oder ersatzlos löschen. Nicht beides behalten.
- **D.4** Undo für die letzte Mutation aus dem Log (der eigentliche Nutzwert; ohne das ist D nur Ballast).

**Akzeptanz:** Eine Karte anlegen → genau eine `events`-Zeile. Undo stellt den Vorzustand her. Kein
Doppel-Event durch Realtime-Echo (die `*Remote`-Methoden dürfen **nicht** loggen).

---

### Phase E — Cognition an echte Read-Models hängen

**Problem:** ~85 % von `packages/cognition` ist toter Code (22 Module, benutzt werden nur
`ExecutiveFunctionEngine`, `KnowledgeEvaluator`, `UserBehaviorLearner`, `Reflection` — alle in `App.tsx`).
Das Backend importiert `cognition` überhaupt nicht. Echtes Reasoning ist ein dünner Mistral-Proxy
(`lib/reasoning.ts` → API).

- **E.1** Inventur: pro Modul entscheiden **benutzen oder löschen**. Kein Modul bleibt "für später".
- **E.2** Die überlebenden Engines gegen echte Read-Models fahren (Graph + Pipeline + Ingestion-Library),
  nicht gegen handgereichte Argumente aus `App.tsx`.
- **E.3** Ergebnis landet als *See → Do*-Vorschlag in der UI, nicht als Score.

**Akzeptanz:** `packages/cognition` schrumpft messbar (LOC vorher/nachher im Commit nennen). Was bleibt,
hat je einen Test.

---

### Phase F — Editor-Block-Modell

**Problem:** `EditorView.tsx` (545 Zeilen) und die Card-Bodies arbeiten auf rohem Markdown-String.
Blöcke, Referenzen (`@card`, `@node`) und Transklusion sind damit nicht darstellbar.

- **F.1** Block-Modell im Domain-Layer (`Block = { id, type, content, children }`), pure Parser/Serializer
  Markdown ⇄ Blocks, vollständig unit-getestet. Kein UI-Code in diesem Slice.
- **F.2** `EditorView` liest/schreibt Blöcke; Markdown bleibt das Persistenzformat (`pipeline_cards.markdown`),
  damit nichts migriert werden muss.
- **F.3** Referenz-Blöcke (`@`-Mention auf Node/Card) erzeugen eine echte Kante im Graphen.

**Akzeptanz:** Round-Trip-Test `md → blocks → md` ist verlustfrei über alle vorhandenen Card-Bodies.
Bestehende Karten öffnen sich unverändert.

---

### Phase G — Semantik über dem World Model

**Bereits da:** pgvector ist aktiv (Extension `vector` 0.8.0), `content_entries.embedding_vec vector(1024)`,
hnsw-Cosine-Index, RPC `match_content_entries`, echte Mistral-Embeddings (`mistral-embed`).
**Offen:** Das gilt nur für die Ingestion-Library, **nicht für den Graphen**.

- **G.1** `world_nodes.embedding_vec` + hnsw-Index (Migration → User). Embedding beim Upsert erzeugen.
- **G.2** RPC `match_world_nodes`; semantische Suche im Brain ("was weiß ich über X").
- **G.3** Duplikaterkennung/Merge-Vorschlag für semantisch fast identische Knoten.

**Akzeptanz:** Zwei inhaltlich gleiche Knoten mit verschiedenen Namen finden sich gegenseitig.

---

### Phase H — Moodboards & Assets als Graphbürger

Moodboards, Assets, Documents und People liegen in eigenen Tabellen und tauchen im Graphen nicht auf.
Ein Moodboard, das eine Card stylt, ist heute nur eine `relationships`-Zeile.

- **H.1** Diese Typen als `Node` projizieren (dasselbe Muster wie `pipelineCardToNode` — die
  `graph-projection` aus `@pronoia/ingestion` ist die Vorlage).
- **H.2** Im Brain sichtbar/filterbar machen.

**Akzeptanz:** Ein Moodboard erscheint im Brain und ist mit seinen Cards verbunden.

---

### Phase I — Skalierung & Härtung

- **I.1 Durable Queue.** `apps/api/src/queues/ingestionQueue.ts` ist eine In-Process-Queue,
  fire-and-forget — auf Vercel Serverless friert die Funktion nach der Response ein. Ingestion-Jobs
  gehen still verloren. **Das ist der wichtigste Punkt dieser Phase.** (Der Telegram-Webhook hatte
  exakt diesen Bug schon; er wurde behoben, indem `processUpdate()` **vor** der Response awaited wird.)
- **I.2** Pagination/Virtualisierung im Brain (aktuell rendert es alle Knoten; ~114 Knoten ergeben
  bereits >1100 SVG-Elemente).
- **I.3** Indizes prüfen (`workspace_id`, `owner_id` auf allen Tabellen).

---

## 3. Querschnitt: bekannte Bugs (unabhängig von den Phasen)

| # | Bug | Ort | Anmerkung |
|---|---|---|---|
| 1 | `ensureLoaded` ersetzt den lokalen Spiegel durch eine leere Liste, wenn das Backend 0 Zeilen liefert → **offline angelegte Items gehen still verloren** (live beobachtet). | `store/collection.ts` | Sauber lösbar erst mit einer Pending-Write-Queue: "remote leer" und "noch nicht synchronisiert" müssen unterscheidbar sein. |
| 2 | Jeder Klick auf „Kaufen" legt eine neue `pending`-Zeile in `orders` an → Waisen bei Abbruch. | `lib/coursePurchase.ts` | Bestehende pending-Order desselben Users/Kurses wiederverwenden. |
| 3 | `LibraryView` überläuft horizontal (~72 px), sobald das Detail-Panel öffnet. | `views/LibraryView.tsx` | Auch auf dem Hooks-Tab reproduzierbar. |
| 4 | Dev-only React-`createRoot`-HMR-Warnungen. | `main.tsx` | Kein `import.meta.hot`-Guard. |
| 5 | Ingestion: Outlier-Baselines brauchen mehrere Videos pro Creator. | `@pronoia/ingestion/outliers` | Bis dahin sind Outlier-Werte für neue Creator bedeutungslos. |
| 6 | Resolver kennt nur YouTube + Instagram. | `@pronoia/ingestion/resolver` | TikTok/X über denselben yt-dlp- bzw. Supadata-Pfad nachrüstbar. |

---

## 4. Telegram — verbleibende Brain-Interface-Features

Der Bot bleibt **Thin Client** über Pronoia Core. Keine Logik im Bot, die nicht auch die Web-App hat.

1. **Entscheidungs-Assistent** — `ExecutiveFunctionEngine` über Telegram befragen.
2. **Goal-Tracking** — Ziele abfragen/fortschreiben.
3. **Pipeline-Management** — Karten verschieben, Status setzen.
4. **Moodboard-Forwarding** — weitergeleitete Bilder landen in einem Moodboard.
5. **Research-Companion** — URL rein → Ingestion + Zusammenfassung zurück.

> Vorsicht bei allen fünf: der Vercel-Freeze aus I.1. Jede DB-Arbeit **vor** der Response awaiten.

---

## 5. Empfohlene Reihenfolge

1. **I.1 (Durable Queue)** — vorziehen. Es ist ein stiller Datenverlust in Produktion, kein Refactor.
2. **Bug 1 + Bug 2** — ebenfalls stiller Datenverlust bzw. Datenmüll.
3. **C.2 → C.3 → C.4** — schließt die State-Schicht ab, während sie frisch ist.
4. **A.3 → A.4 → A.5** — nach dem GATE mit dem User. Größtes Risiko, größter Aufräumeffekt.
5. **E** (Löschen ist billiger als Bauen) → **D** → **F** → **G** → **H** → **I.2/I.3**.
6. Telegram-Features nach Bedarf dazwischen — sie sind unabhängig.

---

## 6. Explizit NICHT tun

- Kein Kollaps auf eine einzige `entities`-Tabelle. Später, und nur wenn es sich auszahlt.
- Kein Neo4j. Postgres + pgvector trägt diese Datenmenge um Größenordnungen.
- Keine Router-, State- oder Test-Library nachziehen. Diese Codebase baut ihre vier Bausteine selbst
  (eigener Store, eigener Test-Runner, eigenes Routing-Split, eigener Resolver-Hook) — bewusst.
- Den Mirror-Hack nicht "nebenbei" im selben Slice mit etwas anderem anfassen.

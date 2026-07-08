# Telegram Bot — Handoff für Antigravity

> **Ziel dieses Dokuments:** Antigravity (oder jeder andere Coding-Agent) soll den Creator-OS-Telegram-Bot **eigenständig fertigstellen**. Alles, was du brauchst — Architektur, aktueller Stand, offene Aufgaben, Fallstricke, Test-Rezepte — steht hier. Lies es einmal ganz, dann arbeite die Roadmap von oben nach unten ab.

---

## 0. TL;DR (in einem Absatz)

Der Bot ist ein **dünner Client** über Pronoia Core (Supabase). Er hat **keine eigene Intelligenz**: er schreibt in und liest aus denselben Tabellen wie die Web-App. Der komplette Grund-Flow (Linken, Idee erfassen, Projekt-Routing mit Inline-Buttons, Morning-Briefing-Cron) ist **gebaut, deployed und live E2E verifiziert** unter `@PronoiaCreatorbot` / `pronoia-creator-os.vercel.app`. Was fehlt, sind die **Brain-Interface-Features** (Voice, Recall, Ingestion von Bild/PDF/URL, Reflexion, etc.) und ein paar **Hygiene-Fixes** (Web zeigt projekt-geroutete Ideen noch nicht an; nichts ist in git committed). Der gesamte relevante Code steckt in **einer Datei**: `apps/api/src/controllers/telegram.ts`.

---

## 1. Architektur & Constraints (unbedingt verstehen)

### Zwei getrennte Systeme
- **Creator OS** (dieses Repo): Vite/React Web (`apps/web`) + Express API (`apps/api`, als Vercel Serverless Functions) + **eigenes** Supabase-Projekt `xposyczkjybgvijxsfpz` (Supabase Auth + per-user RLS).
- **Pronoia Life OS** (`../pronoia-next`, separates Repo): Next.js + Firebase Firestore. Hat seinen **eigenen** Telegram-Bot. **Nicht** derselbe Bot.

### Harte Regeln
1. **Ein Bot-Token = genau ein Webhook** (Telegram-Limit). Creator OS hat deshalb einen **eigenen Bot** mit eigenem Token/Webhook — er kollidiert nicht mit dem Life-OS-Bot.
2. **Der Bot hat keine `auth.uid()`.** Alle Bot-seitigen Writes gehen über den **Service-Role-Client** (`supabaseAdmin`, bypassed RLS) und setzen `owner_id` **explizit**. Vergiss das nie bei neuen Inserts, sonst leakt RLS oder Daten landen ohne Besitzer.
3. **Vercel friert die Function nach der Response ein.** Deshalb: **erst** alle DB-Writes + Telegram-Replies `await`en, **dann** `res.status(200)` senden. Niemals „ack-then-process" (das hat schon einmal stillschweigend alle Writes verschluckt — echter Bug, gefixt). Siehe Kommentar im `/webhook`-Handler.
4. **Identität = E-Mail.** Wenn ein User sein Telegram schon im Life OS verbunden hat, ist seine `telegramId` in Firestore an einen Firebase-User gebunden. Der gemeinsame Schlüssel zu einem Creator-OS-Supabase-User ist die **E-Mail**. `lookupEcosystemTelegramId(email)` in `apps/api/src/ecosystem.ts` macht diesen Cross-System-Lookup über einen HTTP-Seam (gibt `null` zurück, wenn nicht konfiguriert — graceful).

---

## 2. Wo alles liegt (Dateikarte)

| Datei | Rolle |
|---|---|
| `apps/api/src/controllers/telegram.ts` | **Das Herz.** Kompletter Bot: Webhook, Command-Router, Projekt-Routing, Connect/Status/Disconnect, Briefing-Cron. **Fast die gesamte Arbeit passiert hier.** |
| `apps/api/src/ecosystem.ts` | `lookupEcosystemTelegramId(email)` — Cross-System-Reuse via `ECOSYSTEM_LOOKUP_URL` + `ECOSYSTEM_LOOKUP_SECRET`. |
| `apps/api/src/supabase.ts` | `supabaseAdmin` (Service-Role-Client). |
| `apps/api/src/main.ts` | Mountet den Router unter `/api/v1/telegram`. |
| `apps/api/.env.example` | Alle nötigen Env-Vars (siehe unten). |
| `apps/web/src/hooks/useTelegramLink.ts` | Web-Hook: `/connect`, `/status`, `/disconnect`. |
| `apps/web/src/hooks/useProjects.ts` | Synct Projekte aus dem Browser in die `projects`-Tabelle (damit der Server sie sieht). |
| `apps/web/src/views/SettingsView.tsx` | „Connections"-Tab (Connect / zeigt `/link CODE` / verbunden / disconnect). |
| `supabase/migrations/0010_telegram_links.sql` | `telegram_links`-Tabelle. |
| `supabase/migrations/0011_projects_and_routing.sql` | `projects`-Tabelle, `ideas.project_id`, `telegram_links.active_project_id` + `pending_idea`. |
| `vercel.json` | Cron: `/api/v1/telegram/briefing` täglich 06:00. |

---

## 3. Datenmodell (aktuell)

**`telegram_links`** (owner_id = PK, per-user RLS)
- `owner_id` (uuid, → auth user), `telegram_user_id`, `telegram_chat_id`, `telegram_username`
- `link_code` + `code_expires_at` (One-Time-Code, 15-Min-TTL)
- `linked_at` (null = noch nicht verbunden), `source` (`creator_link` | `ecosystem_reuse`)
- `active_project_id` (aktives Ziel-Projekt für neue Ideen)
- `pending_idea` (hält den Idee-Text, während der Projekt-Picker offen ist)

**`projects`** (owner-scoped RLS): `id`, `owner_id`, `name`, `created_at`.

**`ideas`**: bekommt `project_id` (echte Verknüpfung) + `workspace_id` (mirror, damit es in der Web-Ansicht auftaucht, sobald diese nach Projekt scoped).

---

## 4. Aktueller Stand — was FERTIG & LIVE ist ✅

Alles hier ist gebaut, deployed und **live end-to-end getestet** (2026-07-05):

- **Linken:** `/link CODE` (aus App-Einstellungen) **oder** Ecosystem-E-Mail-Reuse.
- **Idee erfassen:** jede Nicht-Command-Nachricht wird zur Idee.
- **Projekt-Routing** (der Kern-Wert): 
  - Aktives Projekt gesetzt → Idee landet direkt dort (+ Button „Anderes Projekt").
  - 0 oder 1 Projekt → keine Rückfrage.
  - Mehrere Projekte, keins aktiv → Inline-Keyboard „Zu welchem Projekt?", Idee wird in `pending_idea` gehalten und beim Button-Callback committed.
- **`/projects`** setzt das aktive Projekt (Inline-Keyboard).
- **`callback_query`-Handling** (`pick:` / `setactive:` / `change`).
- **`/connect`, `/status`, `/disconnect`** (Supabase-JWT-authed).
- **Morning-Briefing-Cron** (`/briefing`, Bearer `CRON_SECRET`): pusht Fokus-Card + offene Ziele an jeden verbundenen User.
- Type-checks + Web-Build + 27 Tests grün.

**Nicht anfassen, außer du erweiterst bewusst:** der Webhook-Response-Flow und das Service-Role/owner_id-Muster. Die sind subtil und schon einmal teuer erkauft (siehe §1, Regel 3).

---

## 5. Was NOCH ZU TUN ist — priorisierte Roadmap

Arbeite von oben nach unten. Jede Aufgabe ist so geschnitten, dass sie einzeln deploy- und testbar ist.

### 🅰️ Hygiene-Fixes (klein, hoher Wert — zuerst)

**A1 — Web zeigt projekt-geroutete Ideen an.**
Ideen, die in ein Nicht-`main-space`-Projekt geroutet werden, tauchen in der Web-Ideation-View **nicht** auf, weil die Web-App noch hart nach `workspace_id = 'main-space'` filtert. Finde die Ideation-Query im Web (`apps/web/src`, suche nach `main-space` / `workspace_id`) und scope sie nach aktivem Projekt bzw. zeige alle Projekte des Users. **Ohne diesen Fix ist das Projekt-Routing für den User unsichtbar.**

**A2 — `git commit`.** Der gesamte Bot (und Nachbararbeit) ist bisher nur im Working Tree; Deploys liefen als Working-Tree-Push via Vercel CLI. Committe den Stand sauber, damit ein späterer git-basierter Deploy nicht regressiert. Branch: `feat/creator-os-session`.

**A3 — Idempotenz gegen Telegram-Retries.** Telegram liefert bei fehlender/langsamer 200-Response denselben Update **erneut** aus → doppelte Ideen möglich. Persistiere `update_id` (kleine Tabelle oder Spalte) und ignoriere bereits gesehene. Billiger Schutz, spart Duplikate.

### 🅱️ Brain-Interface-Features (das eigentliche Produkt-Upgrade)

Alle bleiben **thin client** über Pronoia Core. Reihenfolge = grob nach Wert/Aufwand.

**B1 — Voice-Memos (transkribieren).** `voice`/`audio`-Message → Telegram `getFile` → Datei laden → Transkript (Mistral/Whisper; `MISTRAL_API_KEY` ist schon da) → dann exakt wie eine Text-Idee durch `routeIdea()`. Höchster Alltagswert für einen Creator unterwegs.

**B2 — Instant Recall („Was weiß ich über X").** Command `/recall <query>` oder Natural-Language-Frage → Volltext-/Semantik-Suche über `ideas` (+ ggf. `documents`) des Users → kompakte Antwort. Beginne mit simpler `ilike`-Suche; später pgvector-Embeddings.

**B3 — URL-Ingestion.** Enthält die Nachricht eine URL → Seite fetchen, Titel/Zusammenfassung ziehen, als Idee/Ressource mit Quelle speichern.

**B4 — Bild-/PDF-Ingestion.** `photo`/`document` → `getFile` → Vision/OCR (Mistral Vision) → als Asset/Idee mit extrahiertem Text. Moodboard-Forwarding fällt hier mit rein.

**B5 — Evening-Reflection-Cron.** Zweiter Cron (analog Briefing) am Abend: fragt nach dem Tag, hält die Antwort fest. `vercel.json` erweitern.

**B6 — Approval-Workflow.** Pipeline-Cards, die Freigabe brauchen, per Inline-Button (✅/✏️/❌) aus Telegram genehmigen. Nutzt das bestehende `callback_query`-Muster.

**B7+ (deferred vision):** Decision-Assistant (Executive-Engine), Goal-Tracking, Pipeline-Management, Research-Companion. Erst nach B1–B6.

---

## 6. Muster, die du wiederverwendest (Copy-Paste-Bausteine)

Alles existiert schon in `telegram.ts` — **nachahmen, nicht neu erfinden:**

- **Neuen Command hinzufügen:** im Command-Router in `processUpdate()` einen `if (trimmed.toLowerCase().startsWith('/xyz'))`-Zweig ergänzen. Router ist bewusst erweiterbar gebaut.
- **Neue Inline-Buttons:** `projectKeyboard()` als Vorlage; `callback_data` als `action:payload` kodieren; in `processCallback()` einen `if (action === 'xyz')`-Zweig ergänzen. **Immer** `tgAnswerCallback(cb.id)` aufrufen (sonst dreht sich Telegrams Spinner ewig).
- **Antworten:** `tgSend(chatId, text, keyboard?)`, `tgEditText(...)`. Dynamischen Text **immer** durch `md()` escapen (Markdown-Sonderzeichen).
- **Datei von Telegram holen (für B1/B4):** `getFile` → `file_path` → `https://api.telegram.org/file/bot<TOKEN>/<file_path>`.
- **Idee schreiben:** `captureIdea(ownerId, title, projectId)` — setzt `owner_id`, `project_id`, `workspace_id` korrekt.
- **User auflösen:** aus Webhook über `getLink(fromId)` (Telegram → owner). Aus Web über `authUser(req)` (Bearer-JWT → user).

---

## 7. Go-Live / Betrieb (Env & Webhook)

Env-Vars (Vercel-Env der Creator-OS-App; `.env.example` ist die Referenz):
- `TELEGRAM_BOT_TOKEN` (von @BotFather), `TELEGRAM_BOT_USERNAME` (ohne `@`)
- `TELEGRAM_WEBHOOK_SECRET` (an `setWebhook` übergeben; Telegram echot ihn im Header `x-telegram-bot-api-secret-token` zurück)
- `CRON_SECRET` **oder** `TELEGRAM_CRON_SECRET` (schützt `/briefing`)
- optional: `ECOSYSTEM_LOOKUP_URL` + `ECOSYSTEM_LOOKUP_SECRET` (E-Mail-Reuse)

**Webhook registrieren** (der eine Schritt, der beim ersten Mal vergessen wurde — `getWebhookInfo` zeigte `"url":""`):
```
POST https://api.telegram.org/bot<TOKEN>/setWebhook
  url = https://pronoia-creator-os.vercel.app/api/v1/telegram/webhook
  secret_token = <TELEGRAM_WEBHOOK_SECRET>
```
Prüfen mit `getWebhookInfo`. Migrationen `0010` + `0011` müssen im Supabase-Projekt angew+andt sein (sind sie live).

> ⚠️ **Sicherheit:** Ein früher gepasteter Bot-Token wurde geleakt — falls noch nicht geschehen, **rotieren**. Niemals einen echten Token in dieses Repo/Doc schreiben.

---

## 8. Wie du testest (ohne echtes Telegram)

Der Webhook ist eine normale HTTP-Route — simuliere Telegram-Updates per POST gegen den Deploy (oder lokal), mit korrektem Secret-Header:

```bash
curl -X POST https://pronoia-creator-os.vercel.app/api/v1/telegram/webhook \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>" \
  -d '{"message":{"text":"Meine neue Idee","chat":{"id":123},"from":{"id":123,"username":"tester"}}}'
```

- Ohne/falscher Secret-Header → **401** (verifiziert).
- Für `callback_query` schick `{"callback_query":{...}}` statt `message`.
- **Verifiziere immer in der DB** (nicht nur am 200er): schau in `telegram_links` / `ideas`, ob wirklich persistiert wurde. Der historische Bug gab 200 zurück **und schrieb nichts** — trau der Response nicht blind.
- **Aufräumen:** Test-Rows (`telegram_links`, Test-Ideen, Test-`projects`) nach dem Test wieder löschen.

---

## 9. Fallstricke (teuer gelernt)

1. **Ack-then-process killt Writes auf Vercel.** Immer erst awaiten, dann antworten.
2. **Ohne `owner_id` auf Service-Role-Inserts** landen Rows besitzerlos / brechen RLS.
3. **`TELEGRAM_BOT_USERNAME` wurde mit führendem `@` gesetzt** — der Code strippt es defensiv (`.replace(/^@/, '')`); halte das bei.
4. **Projekte lebten früher nur im Browser-localStorage** → der Server sah sie nicht. Deshalb synct `useProjects` jetzt in die `projects`-Tabelle. Wenn ein neues Feature client-seitige Daten braucht, müssen die erst serverseitig sichtbar gemacht werden.
5. **Web-Ideation filtert noch nach `main-space`** → siehe A1, sonst wirken geroutete Ideen „verschwunden".
6. **Telegram-Retries** → ohne Idempotenz (A3) Duplikate.

---

## 10. Definition of Done (pro Feature)

Ein Feature gilt als fertig, wenn: (a) Type-check + Web-Build + Tests grün, (b) per simuliertem Webhook-POST getestet **und in der DB verifiziert**, (c) Env-Vars dokumentiert falls neu, (d) im Working Tree committed. Halte den Bot **thin** — Logik/Intelligenz gehört nach Pronoia Core, nicht in den Bot.

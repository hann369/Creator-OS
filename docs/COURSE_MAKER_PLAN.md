# Course Maker — Implementierungsplan

> Status: **Plan / noch nicht gebaut.** Erstellt 2026-07-06.
> Idee: Ein frei gestaltbarer Kurs-Builder (Video/PDF/Embeds, Chapters & Pages),
> der als **eigenständige, geteilte Seite** außerhalb des Accounts verkauft und
> abgerufen werden kann — „wie eine Notion-Seite, die man teilt, ohne dass jemand
> aufs ganze Konto kommt".

---

## 1. Produktbild in einem Satz

Ein Creator baut im Studio (hinter Login) einen Kurs aus Blöcken, setzt einen Preis,
klickt **Publish** → bekommt eine öffentliche URL (`/c/:slug`). Ein Käufer landet
dort, kauft, und sieht danach **nur diesen einen Kurs** unter `/learn/:slug` — komplett
getrennt vom restlichen Creator-OS-Konto.

Es entstehen damit **drei Zugriffsebenen**, die es heute nicht gibt:
1. **Creator** (eingeloggt, Eigentümer) — baut & verwaltet.
2. **Öffentlich** (nicht eingeloggt) — sieht Landingpage + kostenlose Preview-Blöcke.
3. **Käufer** (eingeloggt ODER per Magic-Link) — sieht den vollen bezahlten Inhalt.

---

## 2. Was wiederverwendet wird (kein Neubau)

| Vorhanden | Wird zu |
|---|---|
| `Block[]`-Modell in [EditorView.tsx](../apps/web/src/views/EditorView.tsx) | Basis des Course-Block-Modells; erweitert um `video`/`pdf`/`embed`/`divider` |
| Feature-Muster **Migration + `useX`-Hook + View** (Goals/Documents) | `useCourses` + `CourseBuilderView` folgen exakt diesem Muster |
| Asset-Handling ([useAssets.ts](../apps/web/src/hooks/useAssets.ts)) | Video/PDF-Uploads (Supabase Storage statt nur URL-Referenz) |
| Supabase + RLS + `owner_id`-Muster ([0011](../supabase/migrations/0011_projects_and_routing.sql)) | Neue Tabellen mit denselben Policies, plus Public-Read für published |
| Express-API ([apps/api/src/main.ts](../apps/api/src/main.ts)) + Vercel-Rewrites | Payment-Checkout- & Webhook-Endpunkte |
| Vercel-Catch-all → `index.html` ([vercel.json](../vercel.json)) | Deep-Links auf `/c/:slug` funktionieren bereits |

**Der einzige echte Architekturbruch:** heute sitzt ein harter Auth-Gate an der Wurzel
([main.tsx:36](../apps/web/src/main.tsx)) und es gibt **kein Routing**. Beides muss aufgelöst
werden (Phase 2).

---

## 3. Datenmodell (neue Tabellen)

Migration `0012_courses.sql`:

```
courses
  id            text pk
  owner_id      uuid  default auth.uid()
  slug          text  unique            -- öffentliche URL
  title         text
  subtitle      text
  cover_url     text
  price_cents   int   default 0         -- 0 = kostenlos
  currency      text  default 'eur'
  status        text  default 'draft'   -- draft | published | archived
  theme         jsonb                   -- frei gestaltbares Layout (Farben, Font)
  created_at / updated_at

course_chapters
  id, course_id (fk), title, position

course_pages
  id, chapter_id (fk), title, position
  is_preview    bool default false      -- öffentlich sichtbar ohne Kauf?

course_blocks
  id, page_id (fk), position
  type          text                    -- heading|text|video|pdf|embed|image|callout|divider|quiz
  content       jsonb                   -- typ-abhängige Nutzlast (URL, Text, Storage-Pfad …)

course_entitlements                      -- WER darf WELCHEN Kurs sehen
  id, course_id (fk)
  buyer_email   text                    -- Identität des Käufers (siehe §6)
  buyer_user_id uuid null               -- gesetzt, sobald Käufer einloggt
  source        text                    -- 'purchase' | 'grant' | 'free'
  order_id      text null               -- Verweis auf orders
  created_at
```

**RLS-Kern (der Sicherheitsteil):**

- `courses` / chapters / pages / blocks:
  - **Owner:** volles `for all` wie bei `projects`.
  - **Public SELECT:** nur wenn `status = 'published'`. Für `course_pages`/`course_blocks`
    zusätzlich Bedingung: `is_preview = true` **ODER** Aufrufer hat ein Entitlement
    (`exists (select 1 from course_entitlements e where e.course_id = … and e.buyer_user_id = auth.uid())`).
- `course_entitlements`: Käufer sieht **nur seine eigenen** Zeilen; **Insert nur serverseitig**
  über den Service-Role-Key (nie vom Client — sonst kann sich jeder freischalten).

> Das ist der Notion-„Seite teilen ohne Vollzugriff"-Mechanismus: Zugriff hängt an
> `entitlements`, nicht am Account. Der Kurs ist die einzige Ressource, die public/entitled
> lesbar ist; alles andere (goals, ideation, brand identity …) bleibt owner-only.

---

## 4. Routing-Architektur (Phase 2 — der Kernumbau)

Einführen: `react-router-dom`. App in **zwei Route-Bäume** splitten:

```
main.tsx
 └─ <BrowserRouter>
     ├─ /                       → Auth-Gate → Studio (heutige App, unverändert)
     ├─ /studio/*               → wie heute (WorkspaceProvider etc.)
     │
     ├─ /c/:slug                → PUBLIC CourseLanding   (kein Auth-Gate!)
     ├─ /c/:slug/checkout       → Checkout               (kein Auth-Gate!)
     └─ /learn/:slug            → CourseViewer           (Entitlement-Gate statt Auth-Gate)
```

Wichtig: Der heutige Gate in `Root()` wandert **eine Ebene tiefer** — er umschließt nur noch
`/` und `/studio/*`, nicht mehr die Wurzel. Die öffentlichen Routen mounten `WorkspaceProvider`
**nicht** und laden nur den einen Kurs über den Anon-Key (RLS erlaubt genau das published-Subset).

Der Vercel-Rewrite `"/((?!api|ws|assets|vite).*)" → /index.html` deckt Deep-Links bereits ab —
kein Server-Umbau nötig.

---

## 5. Course Builder (Creator-Seite, Phase 1)

- Neuer Studio-View `CourseBuilderView` + Hook `useCourses` (Muster wie `useGoals`).
- **Struktur-Panel:** Chapters → Pages (Drag-Sort, wie die vorhandene `GripVertical`-Logik im Editor).
- **Block-Editor pro Page:** das bestehende `Block`-Rendering + neue Typen:
  - `video` — Upload → Supabase Storage `course-media` Bucket, oder YouTube/Vimeo-Embed-URL.
  - `pdf` — Upload → Storage, Inline-Viewer (`<iframe>`/pdf.js).
  - `embed` — beliebiger iFrame (sandboxed) für Loom, Figma, etc.
  - `image`, `callout`, `divider`, optional `quiz`.
- **Theme/Layout:** `theme`-JSONB (Akzentfarbe, Font aus [fonts.ts](../apps/web/src/lib/fonts.ts), Cover) →
  „frei gestaltbar" ohne vollen Page-Builder; später ausbaubar.
- **Preview-Toggle** pro Page (`is_preview`) — bestimmt, was Nicht-Käufer sehen.
- **Publish-Button:** setzt `status='published'`, erzeugt `slug`, zeigt die öffentliche URL.

Phase 1 ist **komplett unabhängig** baubar und sofort im Studio sichtbar (persistiert wie die
anderen Views offline-first + Supabase).

---

## 6. Käufer-Identität & Zugang (Phase 2/3)

Problem: Ein Käufer soll den Kurs sehen, **ohne** ein volles Creator-OS-Konto anzulegen.

Empfehlung: **Supabase Auth als leichter „Kurs-Login"** wiederverwenden, aber getrennt
präsentiert (Magic-Link / OTP per E-Mail, kein Passwort, keine Studio-UI):

1. Käufer kauft → `orders` + `course_entitlements` (nur `buyer_email`) werden serverseitig angelegt.
2. Käufer bekommt Magic-Link → loggt sich ein → `buyer_user_id` wird an das Entitlement geknüpft.
3. `/learn/:slug` prüft: gibt es ein Entitlement für `auth.uid()` auf diesem Kurs? Ja → voller Inhalt.

Vorteil: kein zweites Auth-System, RLS macht die Durchsetzung, der Käufer sieht nie das Studio.
Ein reiner „Link-Zugang ohne Kauf" (Phase 2) ist derselbe Mechanismus mit `source='grant'`.

---

## 7. Monetarisierung — das In-House-Modul

**Deine Sorge (berechtigt):** Wenn jeder Creator seinen eigenen Stripe-Account + Integration
bräuchte, ist das eine große Einstiegshürde. Antwort: braucht er nicht.

### Empfohlener Weg: Plattform = Merchant of Record (MoR), EIN Stripe-Account

```
Käufer zahlt → Pronoias EINZIGER Stripe-Account (dein bestehender)
            → interne Ledger-Tabelle schreibt dem Creator seinen Anteil gut
            → Auszahlung an Creator separat (siehe unten)
```

- **Creator braucht keinen Stripe-Account** und keine Integration — er setzt nur einen Preis.
- Pronoia kassiert, behält die Plattform-Gebühr, führt intern Buch (`creator_earnings`).
- Genau das Modell von Gumroad / Lemon Squeezy.
- **Preis dafür:** Pronoia wird rechtlich Verkäufer → **trägt USt./VAT- & Steuerpflicht**.
  Das ist real und muss bewusst akzeptiert werden (ggf. später Lemon Squeezy als MoR *unter*
  euch, wenn der VAT-Aufwand zu groß wird).

Neue Tabellen dafür:

```
orders            id, course_id, buyer_email, amount_cents, currency,
                  stripe_payment_intent, status, created_at
creator_earnings  id, owner_id, order_id, gross_cents, platform_fee_cents,
                  net_cents, payout_id null
payouts           id, owner_id, amount_cents, method, status, created_at   -- Phase 3+
```

### Auszahlung an Creator — zwei Stufen

- **Start (einfach):** manuelle/halbautomatische Auszahlung. Ledger zeigt Guthaben,
  Auszahlung per SEPA/PayPal außerhalb des Systems. Null zusätzliche Komplexität, reicht
  für die ersten Creator.
- **Später (skaliert):** **Stripe Connect Express** — Creator macht ein leichtes Onboarding
  (KYC-Formular von Stripe, keine eigene Integration), Pronoia macht `transfers` auf sein
  Connect-Konto. Das Entitlement-/Ledger-Modell oben bleibt identisch.

### Architektur-Prinzip: Payment provider-agnostisch kapseln

Ein `packages/services/payments`-Port mit Interface `createCheckout()` / `handleWebhook()` /
`recordEntitlement()`. Stripe ist die erste Implementierung. Dadurch ist ein späterer Wechsel
zu Lemon Squeezy (falls VAT-Last zu groß) oder Connect ein Adapter-Tausch, kein Rewrite.

### Flow (Stripe, konkret)

1. `/c/:slug/checkout` → Client ruft `POST /api/v1/courses/:id/checkout` (Express).
2. Server erstellt Stripe Checkout Session (Betrag aus `courses.price_cents`, serverseitig —
   nie clientseitig, sonst Preismanipulation).
3. Redirect zu Stripe → Zahlung → Redirect zurück auf `/learn/:slug?session=…`.
4. **Webhook** `POST /api/v1/stripe/webhook` (`checkout.session.completed`, Signatur-verifiziert):
   legt `orders` + `course_entitlements` + `creator_earnings` an (Service-Role-Key).
5. Käufer-Magic-Link → Entitlement wird an `buyer_user_id` gebunden → Zugang.

> Sicherheitskritisch: Entitlements **nur** im Webhook mit Service-Role schreiben. Der Client
> darf sie nie einfügen, sonst umgeht man die Bezahlung.

---

## 8. Phasenplan (liefer­bar in dieser Reihenfolge)

### Phase 1 — Course Builder (unabhängig, sofort sichtbar)
1. Migration `0012_courses.sql` (courses/chapters/pages/blocks + owner-RLS).
2. `useCourses`-Hook (Muster useGoals, offline-first).
3. `CourseBuilderView` + Struktur-Panel (Chapters/Pages) + Block-Editor mit neuen Typen.
4. Supabase Storage Bucket `course-media` für Video/PDF-Uploads.
5. In `App.tsx` als neuen Studio-View einhängen.
**Ergebnis:** Creator kann Kurse bauen & speichern. Noch nichts öffentlich.

### Phase 2 — Public Sharing (der Architekturschritt)
6. `react-router-dom` einführen, `main.tsx` in zwei Route-Bäume splitten, Auth-Gate tiefer legen.
7. Public-Read-RLS für `status='published'` + Preview-Logik.
8. `CourseLanding` (`/c/:slug`) + `CourseViewer` (`/learn/:slug`) — ohne Studio-Chrome.
9. „Publish" erzeugt Slug + URL; Zugang per Grant-Link (`source='grant'`), noch ohne Payment.
**Ergebnis:** Kurs ist als geteilte, getrennte Seite abrufbar. Notion-Sharing-Effekt steht.

### Phase 3 — Monetarisierung (In-House-Modul)
10. `packages/services/payments`-Port + Stripe-Adapter.
11. Migrationen `orders` / `creator_earnings` / `entitlements`-Erweiterung.
12. Express-Endpunkte: Checkout + signatur­verifizierter Webhook (Service-Role-Insert).
13. Käufer-Magic-Link-Flow → Entitlement-Bindung.
14. Creator-Ledger-View im Studio (Guthaben/Umsätze). Auszahlung zunächst manuell.
**Ergebnis:** Voller Verkauf → getrennter Zugang. Auszahlung Stufe 1 (manuell).

### Phase 3+ — Skalierung (optional, später)
15. Stripe Connect Express für automatische Creator-Auszahlungen.
16. Coupons, kostenlose Vorschau-Analytics, Quiz/Progress-Tracking.

---

## 9. Offene Entscheidungen / Risiken

- **VAT/Steuer als MoR** — bewusst zu akzeptieren; Ausweichoption Lemon Squeezy als echter MoR
  unter euch. Vor Phase 3 klären.
- **Käufer-Auth** — Magic-Link über Supabase (empfohlen) vs. reiner Token-Link ohne Login.
  Magic-Link ist sicherer und RLS-durchsetzbar.
- **Media-Storage-Kosten & Video-Streaming** — Supabase Storage reicht für PDFs/kleine Videos;
  für viel/großes Video später Mux/Cloudflare Stream erwägen (Adapter-fähig halten).
- **Routing-Umbau (Phase 2)** berührt den heutigen Auth-Gate — hinter den vorhandenen Tests
  (Phase-0-Harness) und mit Preview-Verifikation durchführen.
- **iFrame-`embed`-Sicherheit** — sandboxed rendern, um XSS über fremde Embeds zu vermeiden.

---

## 10. Empfohlener nächster Schritt

**Phase 1 starten** (Migration + `useCourses` + `CourseBuilderView`). Sie ist risikoarm, folgt
exakt bestehenden Mustern und macht die Idee sofort greifbar — währenddessen bleibt die
Payment-/MoR-Entscheidung (Phase 3) offen, ohne den Fortschritt zu blockieren.

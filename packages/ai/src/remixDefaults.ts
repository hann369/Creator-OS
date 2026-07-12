// ─────────────────────────────────────────────────────────────────────────────
// Weekly Remix defaults, shared between apps/api (the cron enforces the filter)
// and apps/web (SettingsView prefills the editable textarea with it).
//
// The content filter is a set of yes/no questions every remixed idea must pass.
// Users override it per-account via remix_settings.content_filter; this is the
// out-of-the-box version.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum number of filter questions an idea must pass (out of however many
 *  questions the active filter defines). */
export const DEFAULT_MIN_FILTER_SCORE = 6;

export const DEFAULT_CONTENT_FILTER = `DIE 7 FRAGEN — CONTENT FILTER
Jede Content-Idee muss mindestens 6 von 7 Punkten erfüllen. Erreicht sie weniger, wird sie verworfen oder umgebaut.

1. Diagnose-Test (Brand): Beweist dieser Inhalt, dass die meisten Menschen ihren Körper nicht wirklich kennen? Der Zuschauer soll seine bisherige Sicht hinterfragen. (Beispiel: "Kraft entsteht nur im Muskel" ❌ → "Das Nervensystem bestimmt einen großen Teil deiner Kraft" ✅)

2. Körper-Einstieg-Test (Brand): Beginnt der Inhalt beim Körper und bleibt dort verankert? Nicht Motivation, nicht Mindset — sondern Bewegung → Anatomie → Mechanismus → Anwendung.

3. Foundation-Test (Brand): Unterstützt das Video die Idee, dass Körperverständnis und funktionelle Bewegung die Grundlage jeder körperlichen Leistungsfähigkeit sind? Es muss nicht immer Calisthenics sein, aber es muss immer die Foundation stärken.

4. Feldtester-Test (Brand): Kann ich den Mechanismus am eigenen Körper testen oder demonstrieren?

5. Action-Test (Retention & Trust): Kann der Zuschauer innerhalb von 5 Minuten etwas ausprobieren? (Balance-Test, Nasenatmung, Zähne mit links putzen, Fußgewölbe-Test)

6. Embedding-Test (Algorithmus): Würde YouTube dieses Video demselben Zuschauer empfehlen wie meine anderen Videos? (Kein Abrutschen in Biohacking oder Produkt-Reviews.)

7. Curiosity-Test (Performance): Hat das Thema mindestens eine überraschende oder kontraintuitive Erkenntnis? (Der andere Arm wird stärker. Kraft entsteht im Gehirn. Tiefe Kniebeugen können Knieschmerzen verbessern. Atmen beeinflusst deine Stabilität.)`;

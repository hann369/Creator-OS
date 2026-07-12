import { Router, type Request, type Response } from 'express';
import type { ChatProvider } from '@pronoia/ai';
import { resolveProvider, DEFAULT_CONTENT_FILTER, DEFAULT_MIN_FILTER_SCORE } from '@pronoia/ai';
import { resolveOwner } from '../auth.js';
import { supabaseAdmin } from '../supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Remix Engine v2.
//
// Every Sunday morning the cron walks each creator's library and picks the
// CLUSTER with the highest connectivity: the 7 shorts (YouTube Shorts /
// Instagram Reels — media_type 'short') that are most connected to each other
// by topic and/or seed, plus the 1 long video (media_type 'longform') most
// connected to those 7. Connectivity uses everything the analysis knows about
// a video (topic, subTopics, seed, format, hook pattern, mechanism, audience).
//
// The AI (per-user choice in remix_settings: Gemini with the user's key,
// Mistral env-key as fallback) then remixes the 8 videos into fresh ideas.
// Every idea is scored against the user's CONTENT FILTER (numbered yes/no
// questions, default: "Die 7 Fragen"); ideas below min_filter_score are
// dropped. Survivors land in the Idea Bank AND in a weekly markdown report
// (remix_reports) that the Library "Output" tab offers as a .md download.
// ─────────────────────────────────────────────────────────────────────────────

export const remixRouter = Router();

const DEFAULT_WORKSPACE = 'main-space';
const SHORTS_PER_WEEK = 7;
const MAX_IDEAS = 7;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; also accept a header/
// query secret for manual triggers (mirrors the telegram briefing cron).
const CRON_SECRET = () => process.env.CRON_SECRET || process.env.TELEGRAM_CRON_SECRET;

interface SourceVideo {
  id: string;
  title: string;
  creator: string;
  url: string;
  media_type: string;
  outlier_score: number;
  analysis: Record<string, unknown> | null;
}

interface RemixSettings {
  provider: 'gemini' | 'mistral';
  geminiKey?: string;
  contentFilter: string;
  minFilterScore: number;
}

interface FilterCheck {
  q: number;
  pass: boolean;
  why: string;
}

interface RemixIdea {
  title: string;
  hook: string;
  seed: string;
  format: string;
  rationale: string;
  filter: FilterCheck[];
  passes: number;
}

// ─── Per-user settings ────────────────────────────────────────────────────────

async function remixSettings(ownerId: string): Promise<RemixSettings> {
  const { data } = await supabaseAdmin
    .from('remix_settings')
    .select('provider, gemini_api_key, content_filter, min_filter_score')
    .eq('owner_id', ownerId)
    .maybeSingle();
  return {
    provider: data?.provider === 'mistral' ? 'mistral' : 'gemini',
    geminiKey: data?.gemini_api_key || process.env.GEMINI_API_KEY || undefined,
    contentFilter: data?.content_filter?.trim() ? data.content_filter : DEFAULT_CONTENT_FILTER,
    minFilterScore: data?.min_filter_score ?? DEFAULT_MIN_FILTER_SCORE,
  };
}

/** Providers in fallback order: the user's choice first, Mistral (env key) second. */
function providerChain(settings: RemixSettings): { id: string; chat: ChatProvider }[] {
  const chain: { id: string; chat: ChatProvider }[] = [];
  if (settings.provider === 'gemini' && settings.geminiKey) {
    chain.push({ id: 'gemini', chat: resolveProvider('gemini', { geminiKey: settings.geminiKey }) as unknown as ChatProvider });
  }
  chain.push({ id: 'mistral', chat: resolveProvider('mistral', { mistralKey: process.env.MISTRAL_API_KEY }) as unknown as ChatProvider });
  return chain;
}

/** Run one JSON chat completion through the fallback chain. Returns the raw text
 *  plus which provider actually answered. */
async function chatWithFallback(
  chain: { id: string; chat: ChatProvider }[],
  system: string,
  user: string,
): Promise<{ raw: string; provider: string }> {
  let lastErr: Error | null = null;
  for (const { id, chat } of chain) {
    try {
      const raw = await chat.generateChat(
        [{ role: 'system', content: system }, { role: 'user', content: user }],
        { json: true, temperature: 0.7 },
      );
      return { raw, provider: id };
    } catch (err) {
      lastErr = err as Error;
      console.error(`[remix] provider ${id} failed, trying next:`, lastErr.message);
    }
  }
  throw lastErr ?? new Error('No AI provider available');
}

// ─── Connectivity (topic/seed similarity over ALL analysis data) ─────────────

const STOPWORDS = new Set([
  'der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'einen', 'mit', 'für', 'von', 'auf', 'ist', 'sind', 'wie', 'was', 'dein', 'deine', 'nicht', 'sich', 'auch', 'aber', 'beim', 'dass',
  'the', 'and', 'for', 'with', 'from', 'your', 'you', 'how', 'why', 'what', 'this', 'that', 'are', 'not', 'can', 'into', 'about', 'most', 'more',
]);

function tokens(text: unknown): string[] {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Weighted term vector over everything the analysis knows about the video.
 *  Topic and seed dominate (the user's definition of connectivity); format,
 *  hook pattern, mechanism and audience connect as whole categorical values. */
function termVector(v: SourceVideo): Map<string, number> {
  const a = v.analysis ?? {};
  const vec = new Map<string, number>();
  const add = (term: string, w: number) => vec.set(term, (vec.get(term) ?? 0) + w);

  for (const t of tokens(a.topic)) add(t, 3);
  for (const sub of Array.isArray(a.subTopics) ? a.subTopics : []) for (const t of tokens(sub)) add(t, 2);
  for (const t of tokens(a.seed)) add(t, 2);
  for (const t of tokens(v.title)) add(t, 1);
  for (const t of tokens(a.promise)) add(t, 1);
  for (const t of tokens(a.problem)) add(t, 1);

  if (typeof a.format === 'string' && a.format) add(`format:${a.format.toLowerCase()}`, 2);
  if (typeof a.hookPattern === 'string' && a.hookPattern) add(`hook:${a.hookPattern.toLowerCase()}`, 1.5);
  if (typeof a.mechanism === 'string' && a.mechanism) add(`mech:${a.mechanism.toLowerCase()}`, 1.5);
  if (typeof a.audience === 'string' && a.audience) for (const t of tokens(a.audience)) add(`aud:${t}`, 1);
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const other = large.get(term);
    if (other) dot += w * other;
  }
  if (dot === 0) return 0;
  const norm = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, w) => s + w * w, 0));
  return dot / (norm(a) * norm(b));
}

export interface ClusterPick {
  shorts: (SourceVideo & { connectivity: number })[];
  long: (SourceVideo & { connectivity: number }) | null;
}

/** Pick the 7 shorts most connected to each other, then the 1 long most
 *  connected to those 7. Exported for tests. */
export function pickCluster(videos: SourceVideo[], shortsWanted = SHORTS_PER_WEEK): ClusterPick {
  const shorts = videos.filter((v) => v.media_type === 'short');
  const longs = videos.filter((v) => v.media_type === 'longform');

  const vecs = new Map(videos.map((v) => [v.id, termVector(v)] as const));
  const sim = (x: SourceVideo, y: SourceVideo) => cosine(vecs.get(x.id)!, vecs.get(y.id)!);

  // Connectivity of a short = how strongly it links to the rest of the shorts.
  const scoredShorts = shorts
    .map((v) => ({
      ...v,
      connectivity: shorts.reduce((s, o) => (o.id === v.id ? s : s + sim(v, o)), 0),
    }))
    .sort((x, y) => y.connectivity - x.connectivity)
    .slice(0, shortsWanted);

  // The long that connects best to the chosen 7.
  const scoredLongs = longs
    .map((v) => ({
      ...v,
      connectivity: scoredShorts.reduce((s, o) => s + sim(v, o), 0),
    }))
    .sort((x, y) => y.connectivity - x.connectivity);

  return { shorts: scoredShorts, long: scoredLongs[0] ?? null };
}

// ─── Data access ──────────────────────────────────────────────────────────────

async function ownersWithLibrary(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('content_entries')
    .select('owner_id')
    .not('owner_id', 'is', null)
    .not('analysis', 'is', null);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.owner_id as string).filter(Boolean))];
}

async function analysedVideos(ownerId: string): Promise<SourceVideo[]> {
  const { data, error } = await supabaseAdmin
    .from('content_entries')
    .select('id, title, creator, url, media_type, outlier_score, analysis')
    .eq('owner_id', ownerId)
    .not('analysis', 'is', null);
  if (error) throw error;
  return (data ?? []) as SourceVideo[];
}

async function brandContext(ownerId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('brand_identities')
    .select('title, data')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
    .limit(1);
  const identity = data?.[0];
  if (!identity) return 'No brand identity on file — infer a sensible creator voice from the library itself.';
  return `Brand identity "${identity.title ?? 'Untitled'}":\n${JSON.stringify(identity.data ?? {}, null, 0).slice(0, 1500)}`;
}

// ─── The remix call ───────────────────────────────────────────────────────────

function videoBrief(v: SourceVideo, i: number, kind: 'SHORT' | 'LONG'): string {
  const a = v.analysis ?? {};
  return [
    `[${kind} ${i}] "${v.title}" von ${v.creator} (${v.outlier_score}× Baseline)`,
    `  Topic: ${(a.topic as string) ?? '—'} | Seed: ${(a.seed as string) ?? '—'}`,
    `  Format: ${(a.format as string) ?? (a.seedPattern as string) ?? '—'} | Hook: ${(a.hook as string) ?? '—'} (${(a.hookPattern as string) ?? '—'})`,
    `  Mechanismus: ${(a.mechanism as string) ?? '—'} | Substanz: ${String(a.substance ?? '—').slice(0, 300)}`,
  ].join('\n');
}

function parseIdeas(raw: string, minScore: number): RemixIdea[] {
  let parsed: any;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed?.ideas) ? parsed.ideas : Array.isArray(parsed) ? parsed : [];
  const ideas: RemixIdea[] = [];
  for (const it of list) {
    if (typeof it?.title !== 'string' || !it.title.trim()) continue;
    const filter: FilterCheck[] = (Array.isArray(it.filter) ? it.filter : [])
      .map((f: any, i: number) => ({
        q: typeof f?.q === 'number' ? f.q : i + 1,
        pass: !!f?.pass,
        why: String(f?.why ?? '').slice(0, 200),
      }));
    const passes = filter.filter((f) => f.pass).length;
    if (passes < minScore) continue; // the content filter gate
    ideas.push({
      title: String(it.title).slice(0, 300),
      hook: String(it.hook ?? '').slice(0, 600),
      seed: String(it.seed ?? '').slice(0, 600),
      format: String(it.format ?? '').slice(0, 120),
      rationale: String(it.rationale ?? '').slice(0, 500),
      filter,
      passes,
    });
    if (ideas.length >= MAX_IDEAS) break;
  }
  return ideas;
}

async function remixCluster(
  cluster: ClusterPick,
  brand: string,
  settings: RemixSettings,
): Promise<{ ideas: RemixIdea[]; provider: string }> {
  const briefs = [
    ...cluster.shorts.map((v, i) => videoBrief(v, i + 1, 'SHORT')),
    ...(cluster.long ? [videoBrief(cluster.long, 1, 'LONG')] : []),
  ].join('\n\n');

  const system = 'You are a short-form content strategist. You remix a cluster of proven videos into fresh, on-brand ideas by recombining their "lego bricks" (topic, seed, format, hook, mechanism). You are strict about the content filter. Return ONLY JSON. Answer texts in German.';
  const user = [
    brand,
    '',
    `CONTENT FILTER (jede Idee wird gegen JEDE nummerierte Frage geprüft; nur Ideen mit mindestens ${settings.minFilterScore} bestandenen Fragen überleben):`,
    settings.contentFilter,
    '',
    'QUELLEN — der Video-Cluster dieser Woche (die am stärksten verbundenen Videos der Library):',
    briefs,
    '',
    `AUFGABE: Remixe diesen Cluster in ${MAX_IDEAS} neue Short-Form-Ideen für MICH.`,
    cluster.long
      ? 'Nutze das LONG-Video als Tiefen-/Substanz-Quelle: hole daraus Mechanismen und Erkenntnisse und verpacke sie in die bewährten Muster (Hooks, Formate, Seeds) der SHORTS.'
      : 'Es gibt kein Long-Video im Cluster — remixe die Shorts untereinander (Bricks tauschen: Topic behalten/Seed wechseln, Hook transplantieren, Format wechseln, …).',
    'Jede Idee MUSS gegen den Content Filter geprüft werden: beantworte jede nummerierte Frage ehrlich mit pass true/false + einem kurzen Grund. Baue Ideen notfalls um, bis sie bestehen — liefere aber keine geschönten Bewertungen.',
    '',
    'Return ONLY this JSON (no markdown):',
    '{ "ideas": [ { "title": string, "hook": string (gesprochener Hook, 1-2 Sätze), "seed": string (Ein-Zeilen-Prämisse), "format": string, "rationale": string (1 Satz: was wurde von welchen Quellen kombiniert), "filter": [ { "q": number, "pass": boolean, "why": string } ] } ] }',
  ].join('\n');

  const chain = providerChain(settings);
  const { raw, provider } = await chatWithFallback(chain, system, user);
  return { ideas: parseIdeas(raw, settings.minFilterScore), provider };
}

// ─── The weekly markdown report ───────────────────────────────────────────────

function buildMarkdown(
  date: string,
  cluster: ClusterPick,
  ideas: RemixIdea[],
  provider: string,
  settings: RemixSettings,
): string {
  const lines: string[] = [];
  lines.push(`# Weekly Remix — ${date}`);
  lines.push('');
  lines.push(`> KI: **${provider}** · Content-Filter-Gate: mindestens **${settings.minFilterScore}** bestandene Fragen · ${ideas.length} Ideen haben das Gate bestanden.`);
  lines.push('');
  lines.push('## Quellen — der Cluster mit der höchsten Konnektivität');
  lines.push('');
  lines.push(`### Shorts (${cluster.shorts.length})`);
  for (const v of cluster.shorts) {
    const a = v.analysis ?? {};
    lines.push(`- **${v.title}** — ${v.creator} · Topic: ${(a.topic as string) ?? '—'} · Konnektivität ${v.connectivity.toFixed(2)} · [Link](${v.url})`);
  }
  lines.push('');
  if (cluster.long) {
    const a = cluster.long.analysis ?? {};
    lines.push('### Long (1)');
    lines.push(`- **${cluster.long.title}** — ${cluster.long.creator} · Topic: ${(a.topic as string) ?? '—'} · Konnektivität zum Cluster ${cluster.long.connectivity.toFixed(2)} · [Link](${cluster.long.url})`);
  } else {
    lines.push('### Long');
    lines.push('- _Kein analysiertes Long-Video in der Library — Remix lief nur über die Shorts._');
  }
  lines.push('');
  lines.push(`## Remix-Ideen (${ideas.length})`);
  ideas.forEach((idea, i) => {
    lines.push('');
    lines.push(`### ${i + 1}. ${idea.title}`);
    if (idea.hook) lines.push(`**Hook:** ${idea.hook}`);
    if (idea.seed) lines.push(`**Seed:** ${idea.seed}`);
    if (idea.format) lines.push(`**Format:** ${idea.format}`);
    if (idea.rationale) lines.push(`**Remix:** ${idea.rationale}`);
    const failed = idea.filter.filter((f) => !f.pass);
    lines.push(`**Content-Filter:** ${idea.passes}/${idea.filter.length}${failed.length ? ` — nicht bestanden: ${failed.map((f) => `Frage ${f.q} (${f.why})`).join('; ')}` : ' — alle Fragen bestanden ✓'}`);
  });
  lines.push('');
  lines.push('---');
  lines.push('_Automatisch generiert vom Weekly Remix Cron (Creator OS)._');
  return lines.join('\n');
}

// ─── Orchestration ────────────────────────────────────────────────────────────

export async function runWeeklyRemix(ownerFilter?: string): Promise<{ owners: number; ideas: number; reports: number }> {
  const owners = ownerFilter ? [ownerFilter] : await ownersWithLibrary();
  let ideasCreated = 0;
  let reportsCreated = 0;

  for (const ownerId of owners) {
    try {
      const [videos, brand, settings] = await Promise.all([
        analysedVideos(ownerId),
        brandContext(ownerId),
        remixSettings(ownerId),
      ]);
      const cluster = pickCluster(videos);
      if (cluster.shorts.length === 0 && !cluster.long) continue;

      const { ideas, provider } = await remixCluster(cluster, brand, settings);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);

      // 1) File surviving ideas into the Idea Bank (as before).
      for (const idea of ideas) {
        const painPoints = [
          `♻️ Weekly Remix (${date}) — Cluster aus ${cluster.shorts.length} Shorts${cluster.long ? ' + 1 Long' : ''}.`,
          idea.rationale,
          idea.hook ? `Hook: ${idea.hook}` : '',
          idea.seed ? `Seed: ${idea.seed}` : '',
          `Content-Filter: ${idea.passes}/${idea.filter.length}`,
        ].filter(Boolean).join('\n');

        const { error } = await supabaseAdmin.from('ideas').insert({
          id: `idea-remix-${crypto.randomUUID().slice(0, 8)}`,
          workspace_id: DEFAULT_WORKSPACE,
          owner_id: ownerId,
          title: idea.title,
          inspiration_url: cluster.long?.url ?? cluster.shorts[0]?.url ?? '',
          pain_points: painPoints.slice(0, 1000),
          packaging_questions: idea.format ? `Format: ${idea.format}` : '',
          status: 'Idea',
          rating: 0,
          archived: false,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        });
        if (!error) ideasCreated++;
        else console.error('[remix] idea insert failed:', error.message);
      }

      // 2) The weekly markdown report for the Library "Output" tab.
      const markdown = buildMarkdown(date, cluster, ideas, provider, settings);
      const sources = [
        ...cluster.shorts.map((v) => ({ id: v.id, title: v.title, url: v.url, mediaType: 'short', connectivity: Number(v.connectivity.toFixed(3)) })),
        ...(cluster.long ? [{ id: cluster.long.id, title: cluster.long.title, url: cluster.long.url, mediaType: 'longform', connectivity: Number(cluster.long.connectivity.toFixed(3)) }] : []),
      ];
      const { error: reportError } = await supabaseAdmin.from('remix_reports').upsert({
        id: `remix-report-${crypto.randomUUID().slice(0, 8)}`,
        workspace_id: DEFAULT_WORKSPACE,
        owner_id: ownerId,
        week_start: date,
        provider,
        sources,
        ideas,
        ideas_count: ideas.length,
        markdown,
        created_at: now.toISOString(),
      }, { onConflict: 'owner_id,week_start' });
      if (!reportError) reportsCreated++;
      else console.error('[remix] report upsert failed:', reportError.message);
    } catch (err) {
      console.error('[remix] failed for owner', ownerId, (err as Error).message);
    }
  }
  return { owners: owners.length, ideas: ideasCreated, reports: reportsCreated };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Cron-secured (Vercel Cron bearer). `?owner=` scopes a manual run to one user.
remixRouter.all('/weekly', async (req: Request, res: Response) => {
  const provided = req.headers['x-cron-secret'] ?? req.query.secret;
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const ok = CRON_SECRET() && (provided === CRON_SECRET() || bearer === CRON_SECRET());
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const owner = typeof req.query.owner === 'string' ? req.query.owner : undefined;
    const result = await runWeeklyRemix(owner);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// User-triggered run for the signed-in creator (the "Jetzt generieren" button in
// the Library Output tab).
remixRouter.post('/run', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req);
  if (!owner) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await runWeeklyRemix(owner.ownerId);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

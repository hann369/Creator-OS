import type { ChatMessage, ReasoningResult } from '@pronoia/ai';
import type { WorldNode, WorldEdge } from '@pronoia/domain';
import type { ExtendedContentPipeline } from '../context/WorkspaceContext.js';

// ─── Reasoning via server-side proxy ─────────────────────────────────────────
// The Mistral key lives ONLY on the API server (apps/api/src/controllers/
// reasoning.ts). The browser sends messages to /api/v1/reasoning/chat; the key
// never ships in the bundle. Retrieval + prompt building stay client-side.

// The server owns the key, so the client always assumes AI is available and lets
// a clear server error surface if it isn't (503 → shown in the ⌘K footer).
export const aiConfigured = () => true;

async function mistralChat(messages: ChatMessage[], opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  const res = await fetch('/api/v1/reasoning/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, json: opts.json, temperature: opts.temperature })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Reasoning ${res.status}`);
  }
  const data = await res.json();
  return data.content ?? '';
}

// A minimal ReasoningProvider (shape from @pronoia/ai) backed by the browser
// Mistral client — lets pure engines like @pronoia/identity run in the web app.
export const reasoningProvider = {
  async generateReasoning(prompt: string): Promise<ReasoningResult> {
    const raw = await mistralChat([
      {
        role: 'system',
        content:
          'Return ONLY a JSON object with exactly these fields: ' +
          '{"observation": string, "hypotheses": string[], "evidence": string[], ' +
          '"conclusion": string, "recommendations": string[], "confidence": number}.',
      },
      { role: 'user', content: prompt },
    ], { json: true });
    try {
      const p = JSON.parse(raw);
      return {
        observation: p.observation ?? '',
        hypotheses: Array.isArray(p.hypotheses) ? p.hypotheses : [],
        evidence: Array.isArray(p.evidence) ? p.evidence : [],
        conclusion: p.conclusion ?? raw,
        recommendations: Array.isArray(p.recommendations) ? p.recommendations : [],
        confidence: typeof p.confidence === 'number' ? p.confidence : 0.6,
      };
    } catch {
      return { observation: raw, hypotheses: [], evidence: [], conclusion: raw, recommendations: [], confidence: 0.5 };
    }
  },
};

export interface ReasoningContext {
  nodes: WorldNode[];
  edges: WorldEdge[];
  cards: ExtendedContentPipeline[];
}

export interface ReasoningResponse {
  result: ReasoningResult;
  used: string[]; // names of the graph entities the answer was grounded in
}

// ─── Retrieval: rank world-model entities by overlap with the query ──────────
function retrieve(query: string, ctx: ReasoningContext) {
  const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const score = (text: string) => {
    const t = text.toLowerCase();
    return terms.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0);
  };

  const rankedNodes = ctx.nodes
    .map(n => ({ n, s: score(`${n.name} ${n.description ?? ''} ${n.type}`) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map(x => x.n);

  // Fallback to the spine of the graph if nothing matched literally.
  const contextNodes = rankedNodes.length
    ? rankedNodes
    : ctx.nodes.filter(n => n.type === 'goal' || n.lifecycleState === 'core_knowledge').slice(0, 6);

  const contextCards = ctx.cards
    .map(c => ({ c, s: score(`${c.title} ${c.hook ?? ''} ${c.markdown ?? ''}`) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map(x => x.c);

  return { contextNodes, contextCards };
}

const SYSTEM_PROMPT = `Du bist die Pronoia-Reasoning-Engine — ein kognitives Betriebssystem für einen Creator, kein generischer Chatbot.
Du antwortest NICHT sofort mit Allgemeinwissen. Du denkst zuerst über den bereitgestellten Wissensgraph des Nutzers nach, dann antwortest du.
Stil: ruhig, präzise, handlungsorientiert (imperativ), europäisch-nüchtern. Kein Hype, keine Floskeln, keine Emojis.
Nutze VORRANGIG den bereitgestellten Kontext (Knoten, Beziehungen, Content-Pipeline). Wenn der Kontext nicht ausreicht, sage das ehrlich.
Antworte ausschließlich als JSON mit exakt diesen Feldern:
{"observation": string, "hypotheses": string[], "evidence": string[], "conclusion": string, "recommendations": string[], "confidence": number}`;

export async function reason(query: string, ctx: ReasoningContext): Promise<ReasoningResponse> {
  const { contextNodes, contextCards } = retrieve(query, ctx);

  const nodeLines = contextNodes
    .map(n => `- [${n.type}] ${n.name}: ${n.description ?? ''} (Zustand: ${n.lifecycleState})`)
    .join('\n');

  const contextNodeIds = new Set(contextNodes.map(n => n.id));
  const edgeLines = ctx.edges
    .filter(e => contextNodeIds.has(e.sourceId) || contextNodeIds.has(e.targetId))
    .map(e => {
      const s = ctx.nodes.find(n => n.id === e.sourceId)?.name ?? e.sourceId;
      const t = ctx.nodes.find(n => n.id === e.targetId)?.name ?? e.targetId;
      return `- ${s} —${e.relationshipType}→ ${t}`;
    })
    .slice(0, 20)
    .join('\n');

  const cardLines = contextCards
    .map(c => `- "${c.title}" [${c.status}, ${c.format}] Trend ${c.trendScore ?? '?'} · Priorität ${c.executivePriority ?? '?'}`)
    .join('\n');

  const user: ChatMessage = {
    role: 'user',
    content:
      `WISSENSGRAPH — KNOTEN:\n${nodeLines || '(keine relevanten Knoten)'}\n\n` +
      `BEZIEHUNGEN:\n${edgeLines || '(keine)'}\n\n` +
      `CONTENT-PIPELINE:\n${cardLines || '(keine relevanten Karten)'}\n\n` +
      `FRAGE DES NUTZERS: ${query}`
  };

  const raw = await mistralChat([{ role: 'system', content: SYSTEM_PROMPT }, user], { json: true });

  let result: ReasoningResult;
  try {
    const parsed = JSON.parse(raw);
    result = {
      observation: parsed.observation ?? '',
      hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      conclusion: parsed.conclusion ?? raw,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6
    };
  } catch {
    result = { observation: '', hypotheses: [], evidence: [], conclusion: raw, recommendations: [], confidence: 0.5 };
  }

  const used = [...contextNodes.map(n => n.name), ...contextCards.map(c => c.title)];
  return { result, used };
}

// ─── Inline text-selection actions (editor) ─────────────────────────────────
// Markierst du Text → Expand / Challenge / Find Evidence. Keine generischen
// Chat-Antworten: die Aktion denkt über den markierten Text im Kontext des
// Wissensgraphs nach und liefert kurzen, einfügbaren Fließtext.
export type InlineAction = 'expand' | 'challenge' | 'evidence';

const ACTION_TASK: Record<InlineAction, string> = {
  expand:
    'Erweitere diesen Gedanken um 2–3 präzise, handlungsorientierte Sätze. Baue auf dem Wissensgraph auf, wo möglich.',
  challenge:
    'Fordere diesen Gedanken heraus: Nenne in 2–3 Sätzen den stärksten Einwand, blinden Fleck oder Widerspruch — idealerweise gestützt auf Beziehungen im Graph (z. B. contradicts/blocks).',
  evidence:
    'Finde Belege oder Gegenbelege für diesen Gedanken im Wissensgraph. Nenne konkrete Knoten, Ziele oder Karten in 2–3 Sätzen. Wenn es keine gibt, sag das klar.'
};

const ACTION_SYSTEM = `Du bist die Pronoia-Reasoning-Engine, kein generischer Chatbot.
Du denkst über den markierten Text im Kontext des Wissensgraphs des Nutzers nach.
Stil: ruhig, präzise, imperativ, europäisch-nüchtern. Keine Floskeln, keine Emojis, kein Vorwort.
Antworte NUR mit 2–3 Sätzen Fließtext (kein JSON, keine Aufzählung, keine Anrede).`;

export async function actOnSelection(action: InlineAction, selectedText: string, ctx: ReasoningContext): Promise<string> {
  const { contextNodes, contextCards } = retrieve(selectedText, ctx);

  const nodeLines = contextNodes
    .map(n => `- [${n.type}] ${n.name}: ${n.description ?? ''}`)
    .join('\n');
  const contextNodeIds = new Set(contextNodes.map(n => n.id));
  const edgeLines = ctx.edges
    .filter(e => contextNodeIds.has(e.sourceId) || contextNodeIds.has(e.targetId))
    .map(e => {
      const s = ctx.nodes.find(n => n.id === e.sourceId)?.name ?? e.sourceId;
      const t = ctx.nodes.find(n => n.id === e.targetId)?.name ?? e.targetId;
      return `- ${s} —${e.relationshipType}→ ${t}`;
    })
    .slice(0, 12)
    .join('\n');
  const cardLines = contextCards.map(c => `- "${c.title}" [${c.status}]`).join('\n');

  const user: ChatMessage = {
    role: 'user',
    content:
      `WISSENSGRAPH — KNOTEN:\n${nodeLines || '(keine relevanten)'}\n\n` +
      `BEZIEHUNGEN:\n${edgeLines || '(keine)'}\n\n` +
      `CONTENT-PIPELINE:\n${cardLines || '(keine)'}\n\n` +
      `MARKIERTER TEXT:\n"${selectedText}"\n\n` +
      `AUFGABE: ${ACTION_TASK[action]}`
  };

  const raw = await mistralChat([{ role: 'system', content: ACTION_SYSTEM }, user], { temperature: 0.4 });
  return raw.trim();
}

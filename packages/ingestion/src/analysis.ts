import type { ChatProvider, ChatMessage } from '@pronoia/ai';
import type { ContentEntry, VideoAnalysis } from './content-model.js';
import {
  HOOK_PATTERNS,
  SEED_PATTERNS,
  MECHANISMS,
  STORY_STRUCTURES,
  classify,
} from './patterns.js';

// ─────────────────────────────────────────────────────────────────────────────
// AI Content Intelligence (Phase 4).
//
// Sends the fetched content through a structured reasoning pass. The model is
// forced into JSON mode; the result is validated at runtime and, if invalid,
// retried once with a correction prompt. Pattern fields are then snapped onto
// the closed pattern library so downstream filters stay stable.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a content intelligence analyst. Given a short-form video's
metadata, transcript and top comments, extract structured knowledge.

Here are the definitions of the key concepts you must extract:
- Topic: The interest topic or subject focus of the video. This is the subcategory of a niche (e.g., "muscle building" or "STR tax loophole", not just "fitness" or "finance").
- Seed: The actual core idea, premise, or one-line headline of the video (e.g. "Steal this $30M content strategy called T.D.S."). It should be highly relevant, valuable, unique, and shocking/interesting.
- seedPattern (Format): The high-level sequencing or structure for how the video is communicated. Choose the closest one from: ${JSON.stringify(SEED_PATTERNS)}.
- Substance: The context, facts, angles, takes, or examples shared in the video that are framed in a shocking, non-obvious, or interesting way. Summarize this briefly (e.g. "1. Facts about hot sauce sales; 2. Contrarian angle that hot sauce is just a content marketing stunt").

Return ONLY a JSON object with EXACTLY these fields (no prose, no markdown):
{
  "topic": string,
  "subTopics": string[],
  "seed": string,
  "seedPattern": one of ${JSON.stringify(SEED_PATTERNS)},
  "substance": string,
  "hook": string,
  "hookPattern": one of ${JSON.stringify(HOOK_PATTERNS)},
  "mechanism": one of ${JSON.stringify(MECHANISMS)},
  "audience": string,
  "problem": string,
  "promise": string,
  "cta": string,
  "storyStructure": one of ${JSON.stringify(STORY_STRUCTURES)},
  "editingStyle": string,
  "visualStyle": string,
  "retentionTechniques": string[],
  "emotion": string,
  "novelty": string,
  "actionableTakeaways": string[],
  "claims": string[],
  "scientificReferences": string[],
  "confidence": number
}
"confidence" is your certainty from 0.0 to 1.0. Every field must be present.
Use "" or [] when unknown — never omit a field.`;

const REQUIRED_STRING_FIELDS: (keyof VideoAnalysis)[] = [
  'topic', 'seed', 'seedPattern', 'substance', 'hook', 'hookPattern', 'mechanism', 'audience',
  'problem', 'promise', 'cta', 'storyStructure', 'editingStyle', 'visualStyle',
  'emotion', 'novelty',
];
const REQUIRED_ARRAY_FIELDS: (keyof VideoAnalysis)[] = [
  'subTopics', 'retentionTechniques', 'actionableTakeaways', 'claims', 'scientificReferences',
];

export class AnalysisValidationError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
    this.name = 'AnalysisValidationError';
  }
}

function buildUserPrompt(entry: ContentEntry): string {
  const comments = entry.comments.slice(0, 15).map((c) => `- ${c.text}`).join('\n');
  return [
    `Platform: ${entry.platform}`,
    `Creator: ${entry.creator}`,
    `Title: ${entry.title}`,
    `Description: ${entry.description}`,
    entry.metadata.hashtags?.length ? `Hashtags: ${entry.metadata.hashtags.join(' ')}` : '',
    `Stats: ${entry.statistics.views} views, ${entry.statistics.likes} likes, ${entry.statistics.comments} comments`,
    '',
    'Transcript:',
    entry.transcript.slice(0, 8000) || '(no transcript available)',
    '',
    comments ? `Top comments:\n${comments}` : '',
  ].filter(Boolean).join('\n');
}

/** Parse + validate the model output into a VideoAnalysis. Throws on structural failure. */
export function parseAnalysis(raw: string): VideoAnalysis {
  let obj: any;
  try {
    // Tolerate a stray ```json fence if the model adds one.
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    obj = JSON.parse(cleaned);
  } catch {
    throw new AnalysisValidationError('Model did not return valid JSON', raw);
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new AnalysisValidationError('Model JSON was not an object', raw);
  }

  for (const f of REQUIRED_STRING_FIELDS) {
    if (typeof obj[f] !== 'string') obj[f] = '';
  }
  for (const f of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(obj[f])) obj[f] = [];
    else obj[f] = obj[f].filter((x: unknown) => typeof x === 'string');
  }
  obj.confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5;

  // Snap pattern fields onto the closed library.
  obj.seedPattern = classify(obj.seedPattern, SEED_PATTERNS);
  obj.hookPattern = classify(obj.hookPattern, HOOK_PATTERNS);
  obj.mechanism = classify(obj.mechanism, MECHANISMS);
  obj.storyStructure = classify(obj.storyStructure, STORY_STRUCTURES);

  return obj as VideoAnalysis;
}

/**
 * Analyze a ContentEntry into a validated VideoAnalysis.
 * Retries once with a correction hint if the first response fails validation.
 */
export async function analyzeContent(
  entry: ContentEntry,
  ai: ChatProvider,
): Promise<VideoAnalysis> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(entry) },
  ];

  const first = await ai.generateChat(messages, { json: true, temperature: 0.2 });
  try {
    return parseAnalysis(first);
  } catch (err) {
    // One correction attempt: feed the bad output back and demand valid JSON.
    const retry = await ai.generateChat(
      [
        ...messages,
        { role: 'assistant', content: first },
        {
          role: 'user',
          content:
            'That was not valid. Return ONLY the JSON object with all required fields, ' +
            'no markdown, no commentary.',
        },
      ],
      { json: true, temperature: 0 },
    );
    return parseAnalysis(retry); // if this throws, the caller marks the entry failed
  }
}

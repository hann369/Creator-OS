import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentEntry } from '@pronoia/ingestion';
import { rowToEntry } from '../ingestionStores.js';
import type { AuthenticatedUser } from '../auth.js';

// Read-only tools over the caller's own Creator OS data. Every query goes
// through `user.db`, the user-scoped client — RLS is the tenant boundary, not a
// hand-written `owner_id` filter.

const DEFAULT_WORKSPACE = 'main-space';

/** Injected so tests don't need a Mistral key and prod doesn't need a second provider instance. */
export interface ToolDeps {
  embed: (text: string) => Promise<number[]>;
}

// ─── Payload slimming ────────────────────────────────────────────────────────
// A content_entry carries a 1024-dim embedding, a full transcript, and every
// scraped comment. Handing that to a model verbatim burns the context window on
// data it did not ask for, so lists get a summary and the detail tool truncates.

const TRANSCRIPT_PREVIEW = 400;
const TRANSCRIPT_DETAIL = 6000;

function slimEntry(e: ContentEntry, transcriptChars: number) {
  const { embedding: _embedding, transcript, comments, ...rest } = e;
  return {
    ...rest,
    transcript: truncate(transcript ?? '', transcriptChars),
    transcriptLength: (transcript ?? '').length,
    commentCount: comments?.length ?? 0,
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} weitere Zeichen]`;
}

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerTools(server: McpServer, user: AuthenticatedUser, deps: ToolDeps): void {
  const db = user.db;

  server.registerTool(
    'list_projects',
    {
      title: 'Projekte auflisten',
      description:
        'Lists the Creator OS projects (workspaces) of the signed-in user. A project id doubles as the workspaceId that the other tools accept. The default project is "main-space".',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await db.from('projects').select('id, name, accent, created_at');
      if (error) return failure(`Projekte konnten nicht geladen werden: ${error.message}`);
      return json({ projects: data ?? [] });
    },
  );

  server.registerTool(
    'list_pipeline_cards',
    {
      title: 'Content-Pipeline lesen',
      description:
        'Lists content pipeline cards (the production board: idea → scripting → filming → editing → published). Omit projectId to search across every project.',
      inputSchema: {
        projectId: z.string().optional().describe('Project/workspace id. Omit for all projects.'),
        status: z.string().optional().describe('Filter by pipeline status, e.g. "idea" or "published".'),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, status, limit }) => {
      let query = db
        .from('pipeline_cards')
        .select('id, workspace_id, title, hook, format, status, platforms, trend_score, executive_priority, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (projectId) query = query.eq('workspace_id', projectId);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) return failure(`Pipeline konnte nicht geladen werden: ${error.message}`);
      return json({ cards: data ?? [] });
    },
  );

  server.registerTool(
    'get_pipeline_card',
    {
      title: 'Pipeline-Karte im Detail',
      description:
        'Returns one pipeline card in full, including its markdown script/notes, checklists, attachments and comments.',
      inputSchema: { id: z.string().describe('Pipeline card id, from list_pipeline_cards.') },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data, error } = await db.from('pipeline_cards').select('*').eq('id', id).maybeSingle();
      if (error) return failure(`Karte konnte nicht geladen werden: ${error.message}`);
      if (!data) return failure(`Keine Pipeline-Karte mit der id "${id}".`);
      return json({ card: data });
    },
  );

  server.registerTool(
    'list_ideas',
    {
      title: 'Ideen-Bank lesen',
      description:
        'Lists ideas from the Idea Bank. Ideas are account-scoped, not project-scoped — the Telegram bot files them into any project — so this returns every idea unless projectId is given.',
      inputSchema: {
        projectId: z.string().optional().describe('Restrict to ideas routed to this project.'),
        status: z.string().optional().describe('e.g. "Idea", "Draft", "Ready To Record", "Posted".'),
        query: z.string().optional().describe('Case-insensitive substring match on the title.'),
        includeArchived: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, status, query, includeArchived, limit }) => {
      let q = db
        .from('ideas')
        .select('id, workspace_id, project_id, title, status, rating, inspiration_url, pain_points, packaging_questions, archived, promoted_card_id, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (projectId) q = q.eq('project_id', projectId);
      if (status) q = q.eq('status', status);
      if (query) q = q.ilike('title', `%${query}%`);
      if (!includeArchived) q = q.eq('archived', false);

      const { data, error } = await q;
      if (error) return failure(`Ideen konnten nicht geladen werden: ${error.message}`);
      return json({ ideas: data ?? [] });
    },
  );

  server.registerTool(
    'list_goals',
    {
      title: 'Ziele lesen',
      description: 'Lists the creator\'s goals with progress (0..1) and target dates.',
      inputSchema: {
        projectId: z.string().optional(),
        status: z.enum(['active', 'achieved', 'archived']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, status }) => {
      let q = db.from('goals').select('*').order('created_at', { ascending: false });
      if (projectId) q = q.eq('workspace_id', projectId);
      if (status) q = q.eq('status', status);

      const { data, error } = await q;
      if (error) return failure(`Ziele konnten nicht geladen werden: ${error.message}`);
      return json({ goals: data ?? [] });
    },
  );

  server.registerTool(
    'search_library',
    {
      title: 'Library semantisch durchsuchen',
      description:
        'Semantic search over the ingested content library (analysed videos: hooks, transcripts, outlier scores). Ask in natural language — the query is embedded and matched by vector similarity, so it finds meaning rather than keywords. Scoped to a single project because the vector index is per workspace.',
      inputSchema: {
        query: z.string().min(1).describe('Natural-language description of what you are looking for.'),
        projectId: z.string().default(DEFAULT_WORKSPACE),
        limit: z.number().int().min(1).max(30).default(10),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, projectId, limit }) => {
      let vector: number[];
      try {
        vector = await deps.embed(query);
      } catch (err) {
        return failure(`Die Suchanfrage konnte nicht eingebettet werden: ${(err as Error).message}`);
      }

      const { data: matches, error } = await db.rpc('match_content_entries', {
        query_embedding: `[${vector.join(',')}]`,
        p_workspace: projectId,
        p_owner: user.userId,
        match_count: limit,
      });
      if (error) return failure(`Semantische Suche fehlgeschlagen: ${error.message}`);

      const ids = (matches ?? []).map((m: { id: string }) => m.id);
      if (ids.length === 0) return json({ results: [] });

      const similarity = new Map(
        (matches ?? []).map((m: { id: string; similarity: number }) => [m.id, m.similarity]),
      );
      const { data: rows, error: rowErr } = await db.from('content_entries').select('*').in('id', ids);
      if (rowErr) return failure(`Treffer konnten nicht geladen werden: ${rowErr.message}`);

      const byId = new Map((rows ?? []).map((r) => [r.id as string, rowToEntry(r)]));
      const results = ids
        .map((id: string) => {
          const entry = byId.get(id);
          return entry ? { similarity: similarity.get(id), ...slimEntry(entry, TRANSCRIPT_PREVIEW) } : null;
        })
        .filter(Boolean);

      return json({ results });
    },
  );

  server.registerTool(
    'filter_library',
    {
      title: 'Library strukturiert filtern',
      description:
        'Filters the content library by structured attributes rather than meaning: platform, creator, topic, hook pattern, outlier score. Use search_library when the question is about meaning.',
      inputSchema: {
        projectId: z.string().optional(),
        platform: z.string().optional().describe('e.g. "youtube", "instagram".'),
        creator: z.string().optional().describe('Substring match on the creator name.'),
        language: z.string().optional(),
        topic: z.string().optional().describe('Substring match on the analysed topic.'),
        hook: z.string().optional().describe('Exact hook pattern from the hook database.'),
        minOutlier: z.number().optional().describe('Only entries whose outlier score is at least this.'),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ projectId, platform, creator, language, topic, hook, minOutlier, limit }) => {
      let q = db.from('content_entries').select('*').order('created_at', { ascending: false }).limit(limit);
      if (projectId) q = q.eq('workspace_id', projectId);
      if (platform) q = q.eq('platform', platform);
      if (creator) q = q.ilike('creator', `%${creator}%`);
      if (language) q = q.eq('language', language);
      if (topic) q = q.ilike('analysis->>topic', `%${topic}%`);
      if (hook) q = q.eq('analysis->>hookPattern', hook);
      if (minOutlier !== undefined) q = q.gte('outlier_score', minOutlier);

      const { data, error } = await q;
      if (error) return failure(`Library konnte nicht gefiltert werden: ${error.message}`);
      const entries = (data ?? []).map((r) => slimEntry(rowToEntry(r), TRANSCRIPT_PREVIEW));
      return json({ entries });
    },
  );

  server.registerTool(
    'get_library_entry',
    {
      title: 'Library-Eintrag im Detail',
      description:
        'Returns one library entry with its full analysis (hook, mechanism, emotion, structure), statistics, outlier scores, a longer transcript excerpt, and the brain-graph nodes derived from it.',
      inputSchema: { id: z.string().describe('Entry id, from search_library or filter_library.') },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data, error } = await db.from('content_entries').select('*').eq('id', id).maybeSingle();
      if (error) return failure(`Eintrag konnte nicht geladen werden: ${error.message}`);
      if (!data) return failure(`Kein Library-Eintrag mit der id "${id}".`);

      const { data: nodes } = await db
        .from('world_nodes')
        .select('id, name, type')
        .contains('metadata', { extractedFrom: id });

      return json({ entry: slimEntry(rowToEntry(data), TRANSCRIPT_DETAIL), graph: nodes ?? [] });
    },
  );
}

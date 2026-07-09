import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { rowToEntry } from '../ingestionStores.js';
import { enqueueIngestion, processJob } from '../queues/ingestionQueue.js';
import {
  resolveSource,
  plannedContentId,
  UnsupportedSourceError,
  type ContentEntry,
} from '@pronoia/ingestion';

// Library API (Phases 8-10). Ingestion is POST-triggered (server-side: AI +
// providers). Listing/search read content_entries. The browser can also read
// directly via RLS (useLibrary hook); these endpoints exist for structured +
// semantic queries that are cheaper server-side.

const DEFAULT_WORKSPACE = 'main-space';

export const libraryRouter = Router();

async function resolveOwner(req: any): Promise<{ ownerId: string } | null> {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { ownerId: data.user.id };
}

// ─── POST /ingest — resolve + enqueue ──────────────────────────────────────────
libraryRouter.post('/ingest', async (req, res) => {
  const auth = await resolveOwner(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const url = String(req.body?.url ?? '').trim();
  if (!url) return res.status(400).json({ error: 'url is required' });

  const workspaceId = String(req.body?.workspaceId ?? DEFAULT_WORKSPACE);
  try {
    resolveSource(url); // validate up-front so the client gets a clean 400
    const entryId = plannedContentId(url);
    
    if (process.env.VERCEL) {
      console.log(`[ingest] Vercel environment detected. Running ingestion synchronously for ${url}`);
      await processJob({ rawUrl: url, workspaceId, ownerId: auth.ownerId });
      return res.status(200).json({ entryId, status: 'completed' });
    } else {
      enqueueIngestion({ rawUrl: url, workspaceId, ownerId: auth.ownerId });
      return res.status(202).json({ entryId, status: 'queued' });
    }
  } catch (err) {
    if (err instanceof UnsupportedSourceError) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: (err as Error)?.message ?? 'Ingestion failed' });
  }
});

// ─── GET / — structured filter search ──────────────────────────────────────────
libraryRouter.get('/', async (req, res) => {
  const auth = await resolveOwner(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const q = req.query;
  const workspaceId = String(q.workspaceId ?? DEFAULT_WORKSPACE);

  let query = supabaseAdmin
    .from('content_entries')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('owner_id', auth.ownerId);

  if (q.platform) query = query.eq('platform', String(q.platform));
  if (q.creator) query = query.ilike('creator', `%${String(q.creator)}%`);
  if (q.language) query = query.eq('language', String(q.language));
  if (q.minViews) query = query.gte('statistics->>views', String(q.minViews));
  if (q.minOutlier) query = query.gte('outlier_score', Number(q.minOutlier));
  // JSON-scoped filters over the analysis blob.
  if (q.topic) query = query.ilike('analysis->>topic', `%${String(q.topic)}%`);
  if (q.hook) query = query.eq('analysis->>hookPattern', String(q.hook));
  if (q.seedPattern) query = query.eq('analysis->>seedPattern', String(q.seedPattern));
  if (q.mechanism) query = query.eq('analysis->>mechanism', String(q.mechanism));
  if (q.emotion) query = query.ilike('analysis->>emotion', `%${String(q.emotion)}%`);

  // Semantic mode ("videos similar to this"): real pgvector nearest-neighbour
  // via the match RPC, seeded by the reference entry's embedding.
  if (q.similarTo) {
    const seed = await fetchOne(String(q.similarTo), auth.ownerId);
    if (!seed?.embedding?.length) return res.json({ entries: [] });
    const { data: matches, error: rpcErr } = await supabaseAdmin.rpc('match_content_entries', {
      query_embedding: `[${seed.embedding.join(',')}]`,
      p_workspace: workspaceId,
      p_owner: auth.ownerId,
      match_count: 20,
      exclude_id: seed.id,
    });
    if (rpcErr) return res.status(500).json({ error: rpcErr.message });
    const ids = (matches ?? []).map((m: any) => m.id);
    if (ids.length === 0) return res.json({ entries: [] });
    const { data: rows } = await supabaseAdmin.from('content_entries').select('*').in('id', ids);
    const byId = new Map((rows ?? []).map((r: any) => [r.id, rowToEntry(r)]));
    const ordered = ids.map((id: string) => byId.get(id)).filter(Boolean) as ContentEntry[];
    return res.json({ entries: ordered.map(stripHeavy) });
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message });

  const entries = (data ?? []).map(rowToEntry);
  return res.json({ entries: entries.map(stripHeavy) });
});

// ─── GET /:id — full entry + graph neighbours ───────────────────────────────────
libraryRouter.get('/:id', async (req, res) => {
  const auth = await resolveOwner(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const entry = await fetchOne(req.params.id, auth.ownerId);
  if (!entry) return res.status(404).json({ error: 'Not found' });

  // Graph connections: nodes derived from this entry.
  const { data: nodes } = await supabaseAdmin
    .from('world_nodes')
    .select('id, name, type')
    .contains('metadata', { extractedFrom: entry.id });

  return res.json({ entry, graph: nodes ?? [] });
});

// ─── PATCH /:id/transcript — browser-fetched transcript patch ──────────────────
// Called from the browser after the ingestion pipeline completes with an empty
// transcript (YouTube blocked the server IP). The browser runs from the user's
// residential IP and can fetch caption tracks freely.
libraryRouter.patch('/:id/transcript', async (req, res) => {
  const auth = await resolveOwner(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const transcript = String(req.body?.transcript ?? '').trim();
  if (!transcript) return res.status(400).json({ error: 'transcript is required' });
  if (transcript.length > 300_000) return res.status(413).json({ error: 'transcript too large' });

  // Only patch if the entry exists, belongs to this user, and has no transcript yet.
  const entry = await fetchOne(req.params.id, auth.ownerId);
  if (!entry) return res.status(404).json({ error: 'Not found' });

  const { error } = await supabaseAdmin
    .from('content_entries')
    .update({ transcript, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('owner_id', auth.ownerId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});


async function fetchOne(id: string, ownerId: string): Promise<ContentEntry | null> {
  const { data } = await supabaseAdmin
    .from('content_entries').select('*').eq('id', id).eq('owner_id', ownerId).maybeSingle();
  return data ? rowToEntry(data) : null;
}

// Drop the embedding from list payloads (large, not needed for the grid).
function stripHeavy(e: ContentEntry): ContentEntry {
  const { embedding, ...rest } = e;
  return rest as ContentEntry;
}

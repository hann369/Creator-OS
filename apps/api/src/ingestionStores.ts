import { supabaseAdmin } from './supabase.js';
import type {
  ContentEntry,
  CreatorProfile,
  IngestionStatus,
  ContentStore,
  CreatorProfileStore,
  DedupeCandidate,
} from '@pronoia/ingestion';
import type { WorldNode, WorldEdge } from '@pronoia/domain';
import type { GraphRepository, GraphTransaction } from '@pronoia/services';

// ─────────────────────────────────────────────────────────────────────────────
// Supabase-backed persistence for the ingestion pipeline. Uses the service-role
// client (bypasses RLS), so owner_id MUST be stamped explicitly — otherwise the
// browser (which reads under RLS: auth.uid() = owner_id) would never see the row.
// ─────────────────────────────────────────────────────────────────────────────

// pgvector accepts its text literal form '[a,b,c]' over PostgREST.
function toVec(arr?: number[]): string | null {
  return arr && arr.length ? `[${arr.join(',')}]` : null;
}

function entryToRow(e: ContentEntry, ownerId: string) {
  return {
    id: e.id,
    workspace_id: e.workspaceId,
    owner_id: ownerId,
    platform: e.platform,
    creator: e.creator,
    creator_id: e.creatorId,
    url: e.url,
    canonical_url: e.canonicalUrl,
    media_type: e.mediaType,
    published_at: e.publishedAt ? e.publishedAt.toISOString() : null,
    duration: e.duration ?? null,
    language: e.language ?? null,
    title: e.title,
    description: e.description,
    thumbnail: e.thumbnail ?? null,
    transcript: e.transcript,
    comments: e.comments,
    statistics: e.statistics,
    metadata: e.metadata,
    analysis: e.analysis ?? null,
    outlier: e.outlier ?? null,
    outlier_score: e.outlier?.outlierScore ?? 1,
    embedding: e.embedding ?? null,
    embedding_vec: toVec(e.embedding),
    status: e.status,
    error: e.error ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToEntry(r: any): ContentEntry {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    platform: r.platform,
    creator: r.creator ?? '',
    creatorId: r.creator_id ?? '',
    url: r.url,
    canonicalUrl: r.canonical_url,
    mediaType: r.media_type ?? 'short',
    publishedAt: r.published_at ? new Date(r.published_at) : undefined,
    duration: r.duration ?? undefined,
    language: r.language ?? undefined,
    title: r.title ?? '',
    description: r.description ?? '',
    thumbnail: r.thumbnail ?? undefined,
    transcript: r.transcript ?? '',
    comments: r.comments ?? [],
    statistics: r.statistics ?? { views: 0, likes: 0, comments: 0, shares: 0 },
    metadata: r.metadata ?? { hashtags: [], mentions: [] },
    analysis: r.analysis ?? undefined,
    outlier: r.outlier ?? undefined,
    embedding: r.embedding ?? undefined,
    status: r.status,
    error: r.error ?? undefined,
    createdAt: new Date(r.created_at ?? Date.now()),
    updatedAt: new Date(r.updated_at ?? Date.now()),
  };
}

// Map a ContentEntry patch (camelCase) onto content_entries columns.
function patchToRow(patch: Partial<ContentEntry>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const m: Record<keyof ContentEntry, string> = {
    creator: 'creator', creatorId: 'creator_id', title: 'title', description: 'description',
    thumbnail: 'thumbnail', transcript: 'transcript', comments: 'comments', statistics: 'statistics',
    metadata: 'metadata', analysis: 'analysis', outlier: 'outlier', embedding: 'embedding',
    duration: 'duration', language: 'language', status: 'status', error: 'error',
  } as any;
  for (const [k, col] of Object.entries(m)) {
    const v = (patch as any)[k];
    if (v !== undefined) row[col] = v;
  }
  if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt?.toISOString() ?? null;
  if (patch.outlier !== undefined) row.outlier_score = patch.outlier?.outlierScore ?? 1;
  if (patch.embedding !== undefined) row.embedding_vec = toVec(patch.embedding);
  return row;
}

export function makeContentStore(ownerId: string): ContentStore {
  return {
    async create(entry) {
      const { error } = await supabaseAdmin.from('content_entries').upsert(entryToRow(entry, ownerId), { onConflict: 'id' });
      if (error) throw error;
    },
    async update(id, patch) {
      const { error } = await supabaseAdmin.from('content_entries').update(patchToRow(patch)).eq('id', id);
      if (error) throw error;
    },
    async setStatus(id, status: IngestionStatus, err?: string) {
      const { error } = await supabaseAdmin
        .from('content_entries')
        .update({ status, error: err ?? null, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    async findById(id) {
      const { data, error } = await supabaseAdmin.from('content_entries').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? rowToEntry(data) : null;
    },
    async listDedupeCandidates(workspaceId): Promise<DedupeCandidate[]> {
      const { data, error } = await supabaseAdmin
        .from('content_entries')
        .select('id, platform, canonical_url, embedding')
        .eq('workspace_id', workspaceId)
        .neq('status', 'failed'); // failed entries are retryable, not duplicates
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, platform: r.platform, canonicalUrl: r.canonical_url, videoId: null, embedding: r.embedding ?? undefined,
      }));
    },
  };
}

export function makeCreatorProfileStore(ownerId: string): CreatorProfileStore {
  return {
    async find(creatorId, workspaceId) {
      const { data, error } = await supabaseAdmin
        .from('creator_profiles')
        .select('*')
        .eq('creator_id', creatorId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        creatorId: data.creator_id, platform: data.platform, creator: data.creator,
        averageViews: Number(data.average_views), medianViews: Number(data.median_views),
        averageLikes: Number(data.average_likes), postingFrequencyPerWeek: Number(data.posting_frequency_per_week),
        topicDistribution: data.topic_distribution ?? {}, sampleSize: data.sample_size ?? 0,
        workspaceId: data.workspace_id, updatedAt: new Date(data.updated_at),
      } satisfies CreatorProfile;
    },
    async upsert(p: CreatorProfile) {
      const { error } = await supabaseAdmin.from('creator_profiles').upsert({
        id: `${p.platform}:${p.creatorId}`,
        workspace_id: p.workspaceId, owner_id: ownerId,
        platform: p.platform, creator_id: p.creatorId, creator: p.creator,
        average_views: p.averageViews, median_views: p.medianViews, average_likes: p.averageLikes,
        posting_frequency_per_week: p.postingFrequencyPerWeek, topic_distribution: p.topicDistribution,
        sample_size: p.sampleSize, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
    },
  };
}

// ─── GraphRepository adapter over world_nodes / world_edges ────────────────────
// No cross-statement transactions over the REST client (matches the existing
// worldModelRepo), so the transaction token is a no-op boundary.
const noopTx: GraphTransaction = { async commit() {}, async rollback() {} };

function nodeToRow(n: WorldNode, ownerId: string) {
  return {
    id: n.id, workspace_id: n.workspaceId, owner_id: ownerId, name: n.name, type: n.type,
    description: n.description ?? null, confidence: n.confidence,
    lifecycle_state: n.lifecycleState, source_count: n.sourceCount, metadata: n.metadata ?? {},
  };
}
function rowToNode(r: any): WorldNode {
  return {
    id: r.id, workspaceId: r.workspace_id, name: r.name, type: r.type, description: r.description,
    confidence: r.confidence, lifecycleState: r.lifecycle_state, sourceCount: r.source_count ?? 1,
    metadata: r.metadata ?? {}, derivedFrom: [], lastVerified: new Date(r.updated_at ?? Date.now()),
    createdAt: new Date(r.created_at ?? Date.now()), updatedAt: new Date(r.updated_at ?? Date.now()),
  };
}

export function makeGraphRepository(ownerId: string): GraphRepository {
  return {
    async beginTransaction() { return noopTx; },
    async saveNode(node) {
      const { error } = await supabaseAdmin.from('world_nodes').upsert(nodeToRow(node, ownerId), { onConflict: 'id' });
      if (error) throw error;
    },
    async findNode(id) {
      const { data, error } = await supabaseAdmin.from('world_nodes').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? rowToNode(data) : null;
    },
    async deleteNode(id) {
      await supabaseAdmin.from('world_nodes').delete().eq('id', id);
    },
    async listNodes(workspaceId) {
      const { data } = await supabaseAdmin.from('world_nodes').select('*').eq('workspace_id', workspaceId);
      return (data ?? []).map(rowToNode);
    },
    async saveEdge(edge: WorldEdge) {
      const { error } = await supabaseAdmin.from('world_edges').upsert({
        id: edge.id, workspace_id: edge.workspaceId, owner_id: ownerId,
        source_id: edge.sourceId, target_id: edge.targetId,
        weight: edge.weight, relationship_type: edge.relationshipType, confidence: edge.confidence,
      }, { onConflict: 'id' });
      if (error) throw error;
    },
    async findEdge(sourceId, targetId) {
      const { data } = await supabaseAdmin
        .from('world_edges').select('*').eq('source_id', sourceId).eq('target_id', targetId).maybeSingle();
      if (!data) return null;
      return {
        id: data.id, workspaceId: data.workspace_id, sourceId: data.source_id, targetId: data.target_id,
        weight: data.weight, relationshipType: data.relationship_type, confidence: data.confidence,
        createdAt: new Date(data.created_at ?? Date.now()),
      };
    },
    async deleteEdge(sourceId, targetId) {
      await supabaseAdmin.from('world_edges').delete().eq('source_id', sourceId).eq('target_id', targetId);
    },
    async listEdges(workspaceId) {
      const { data } = await supabaseAdmin.from('world_edges').select('*').eq('workspace_id', workspaceId);
      return (data ?? []).map((d: any) => ({
        id: d.id, workspaceId: d.workspace_id, sourceId: d.source_id, targetId: d.target_id,
        weight: d.weight, relationshipType: d.relationship_type, confidence: d.confidence,
        createdAt: new Date(d.created_at ?? Date.now()),
      }));
    },
    async getNeighbors() { return []; },
    async findPaths() { return []; },
  };
}

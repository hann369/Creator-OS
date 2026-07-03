import { createClient } from '@supabase/supabase-js';
import type { WorldNode, WorldEdge, ContentPipeline } from '@pronoia/domain';

// Backend Supabase client using the service role key for admin-level access.
// The service role key bypasses RLS — never expose this to the frontend!
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// ─── World Model Repository ──────────────────────────────────────────────────

export const worldModelRepo = {
  async listNodes(workspaceId: string): Promise<WorldNode[]> {
    const { data, error } = await supabaseAdmin
      .from('world_nodes')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return (data ?? []).map(rowToNode);
  },

  async createNode(node: WorldNode): Promise<WorldNode> {
    const { data, error } = await supabaseAdmin
      .from('world_nodes')
      .insert(nodeToRow(node))
      .select()
      .single();
    if (error) throw error;
    return rowToNode(data);
  },

  async updateNode(id: string, updates: Partial<WorldNode>): Promise<void> {
    const dbUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;
    if (updates.lifecycleState !== undefined) dbUpdates.lifecycle_state = updates.lifecycleState;
    const { error } = await supabaseAdmin.from('world_nodes').update(dbUpdates).eq('id', id);
    if (error) throw error;
  },

  async deleteNode(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('world_nodes').delete().eq('id', id);
    if (error) throw error;
  },

  async listEdges(workspaceId: string): Promise<WorldEdge[]> {
    const { data, error } = await supabaseAdmin
      .from('world_edges')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return (data ?? []).map(rowToEdge);
  },

  async createEdge(edge: WorldEdge): Promise<WorldEdge> {
    const { data, error } = await supabaseAdmin
      .from('world_edges')
      .insert({
        id: edge.id,
        workspace_id: edge.workspaceId,
        source_id: edge.sourceId,
        target_id: edge.targetId,
        weight: edge.weight,
        relationship_type: edge.relationshipType,
        confidence: edge.confidence
      })
      .select()
      .single();
    if (error) throw error;
    return rowToEdge(data);
  },

  async deleteEdge(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('world_edges').delete().eq('id', id);
    if (error) throw error;
  }
};

// ─── Pipeline Repository ─────────────────────────────────────────────────────

export const pipelineRepo = {
  async listCards(workspaceId: string): Promise<ContentPipeline[]> {
    const { data, error } = await supabaseAdmin
      .from('pipeline_cards')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToCard);
  },

  async createCard(card: Partial<ContentPipeline> & { id: string; workspaceId: string; title: string }): Promise<ContentPipeline> {
    const { data, error } = await supabaseAdmin
      .from('pipeline_cards')
      .insert({
        id: card.id,
        workspace_id: card.workspaceId,
        title: card.title,
        hook: card.hook ?? '',
        format: card.format ?? 'longform',
        status: card.status ?? 'idea',
        platforms: card.platforms ?? ['youtube'],
        trend_score: card.trendScore ?? 5.0,
        executive_priority: card.executivePriority ?? 5.0,
        markdown: '',
        checklists: [],
        attachments: [],
        comments: []
      })
      .select()
      .single();
    if (error) throw error;
    return rowToCard(data);
  },

  async updateCard(id: string, updates: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseAdmin
      .from('pipeline_cards')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteCard(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('pipeline_cards').delete().eq('id', id);
    if (error) throw error;
  }
};

// ─── Mappers ─────────────────────────────────────────────────────────────────

function rowToNode(row: any): WorldNode {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: row.type,
    description: row.description,
    confidence: row.confidence,
    lifecycleState: row.lifecycle_state,
    sourceCount: row.source_count,
    metadata: row.metadata ?? {},
    derivedFrom: [],
    lastVerified: new Date(row.updated_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function nodeToRow(node: WorldNode) {
  return {
    id: node.id,
    workspace_id: node.workspaceId,
    name: node.name,
    type: node.type,
    description: node.description,
    confidence: node.confidence,
    lifecycle_state: node.lifecycleState,
    source_count: node.sourceCount,
    metadata: node.metadata ?? {}
  };
}

function rowToEdge(row: any): WorldEdge {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    targetId: row.target_id,
    weight: row.weight,
    relationshipType: row.relationship_type,
    confidence: row.confidence,
    createdAt: new Date(row.created_at)
  };
}

function rowToCard(row: any): ContentPipeline {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    hook: row.hook,
    format: row.format,
    status: row.status,
    platforms: row.platforms ?? [],
    trendScore: row.trend_score,
    executivePriority: row.executive_priority,
    linkedNodeIds: [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

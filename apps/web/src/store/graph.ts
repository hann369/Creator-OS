import type { ContentPipeline, WorldEdge, WorldNode } from '@pronoia/domain';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from './collection.js';

// The project's graph and pipeline as three shared stores (Roadmap Phase B,
// final slice). world_nodes / world_edges / pipeline_cards used to be loaded and
// written by WorkspaceContext through the entityStore god-adapter, each with its
// own localStorage mirror. They are ordinary collections now; the context keeps
// the realtime subscriptions and feeds them in through insertRemote/
// replaceRemote/dropRemote, which never write back.
//
// All three append: the graph and the pipeline columns read as creation order.

/** A pipeline card as the editor uses it: markdown body, checklist, comments. */
export interface ExtendedContentPipeline extends ContentPipeline {
  markdown?: string;
  checklists?: { id: string; text: string; done: boolean }[];
  attachments?: { id: string; name: string; type: string; url?: string }[];
  comments?: { id: string; author: string; text: string; createdAt: string }[];
}

// ─── Row ↔ model mappers ─────────────────────────────────────────────────────
export function rowToNode(row: any): WorldNode {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    name: row.name,
    type: row.type,
    description: row.description,
    confidence: row.confidence,
    lifecycleState: row.lifecycle_state,
    sourceCount: row.source_count,
    metadata: row.metadata ?? {},
    derivedFrom: [],
    lastVerified: new Date(row.updated_at ?? row.created_at ?? new Date()),
    createdAt: new Date(row.created_at ?? new Date()),
    updatedAt: new Date(row.updated_at ?? new Date())
  };
}

export function nodeToRow(node: WorldNode) {
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

export function rowToEdge(row: any): WorldEdge {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    sourceId: row.source_id,
    targetId: row.target_id,
    weight: row.weight != null ? parseFloat(row.weight) : 1.0,
    relationshipType: row.relationship_type,
    confidence: row.confidence,
    createdAt: new Date(row.created_at ?? new Date())
  };
}

export function edgeToRow(edge: WorldEdge) {
  return {
    id: edge.id,
    workspace_id: edge.workspaceId,
    source_id: edge.sourceId,
    target_id: edge.targetId,
    weight: edge.weight,
    relationship_type: edge.relationshipType,
    confidence: edge.confidence
  };
}

export function rowToCard(row: any): ExtendedContentPipeline {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    title: row.title,
    hook: row.hook,
    format: row.format,
    status: row.status,
    platforms: row.platforms ?? [],
    trendScore: row.trend_score,
    executivePriority: row.executive_priority,
    markdown: row.markdown,
    checklists: row.checklists ?? [],
    attachments: row.attachments ?? [],
    comments: row.comments ?? [],
    linkedNodeIds: [],
    createdAt: new Date(row.created_at ?? new Date()),
    updatedAt: new Date(row.updated_at ?? new Date())
  };
}

export function cardToRow(c: ExtendedContentPipeline) {
  return {
    id: c.id,
    workspace_id: c.workspaceId,
    title: c.title,
    hook: c.hook,
    format: c.format,
    status: c.status,
    platforms: c.platforms,
    trend_score: c.trendScore,
    executive_priority: c.executivePriority,
    markdown: c.markdown,
    checklists: c.checklists,
    attachments: c.attachments,
    comments: c.comments
  };
}

// ─── Collections ─────────────────────────────────────────────────────────────
export const nodes = createCollection<WorldNode>({
  table: 'world_nodes', lsKey: 'pronoia_nodes', idOf: (n) => n.id,
  fromRow: rowToNode, toRow: nodeToRow, stampUpdatedAt: true, insertAt: 'end',
});

export const edges = createCollection<WorldEdge>({
  table: 'world_edges', lsKey: 'pronoia_edges', idOf: (e) => e.id,
  fromRow: rowToEdge, toRow: edgeToRow, insertAt: 'end',
});

export const cards = createCollection<ExtendedContentPipeline>({
  table: 'pipeline_cards', lsKey: 'pronoia_cards', idOf: (c) => c.id,
  fromRow: rowToCard, toRow: cardToRow, stampUpdatedAt: true, insertAt: 'end',
});

/** Every edge touching a node — the cascade set when that node is deleted. */
export function edgesTouching(nodeId: string): WorldEdge[] {
  return edges.getAll().filter((e) => e.sourceId === nodeId || e.targetId === nodeId);
}

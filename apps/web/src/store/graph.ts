import type { ContentPipeline, WorldEdge, WorldNode, Node, Edge } from '@pronoia/domain';
import type { CardBricks } from '../lib/legoBricks.js';
import { worldNodeToNode, nodeToWorldNode, worldEdgeToEdge, edgeToWorldEdge } from '@pronoia/domain';
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
  /** The Lego Brick composition of this card (Phase 3). */
  bricks?: CardBricks;
}

// ─── Row ↔ model mappers ─────────────────────────────────────────────────────
export function rowToNode(row: any): Node {
  const legacyNode: WorldNode = {
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
  return worldNodeToNode(legacyNode);
}

export function nodeToRow(node: Node) {
  const legacyNode = nodeToWorldNode(node);
  return {
    id: legacyNode.id,
    workspace_id: legacyNode.workspaceId,
    name: legacyNode.name,
    type: legacyNode.type,
    description: legacyNode.description,
    confidence: legacyNode.confidence,
    lifecycle_state: legacyNode.lifecycleState,
    source_count: legacyNode.sourceCount,
    metadata: legacyNode.metadata ?? {}
  };
}

export function rowToEdge(row: any): Edge {
  const legacyEdge: WorldEdge = {
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    sourceId: row.source_id,
    targetId: row.target_id,
    weight: row.weight != null ? parseFloat(row.weight) : 1.0,
    relationshipType: row.relationship_type,
    confidence: row.confidence,
    createdAt: new Date(row.created_at ?? new Date())
  };
  return worldEdgeToEdge(legacyEdge);
}

export function edgeToRow(edge: Edge) {
  const legacyEdge = edgeToWorldEdge(edge);
  return {
    id: legacyEdge.id,
    workspace_id: legacyEdge.workspaceId,
    source_id: legacyEdge.sourceId,
    target_id: legacyEdge.targetId,
    weight: legacyEdge.weight,
    relationship_type: legacyEdge.relationshipType,
    confidence: legacyEdge.confidence
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
    bricks: row.bricks ?? {},
    linkedNodeIds: [],
    x: row.x != null ? parseFloat(row.x) : undefined,
    y: row.y != null ? parseFloat(row.y) : undefined,
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
    comments: c.comments,
    bricks: c.bricks ?? {},
    x: c.x,
    y: c.y
  };
}

// ─── Collections ─────────────────────────────────────────────────────────────
export const nodes = createCollection<Node>({
  table: 'world_nodes', lsKey: 'pronoia_nodes', idOf: (n) => n.id,
  fromRow: rowToNode, toRow: nodeToRow, stampUpdatedAt: true, insertAt: 'end',
});

export const edges = createCollection<Edge>({
  table: 'world_edges', lsKey: 'pronoia_edges', idOf: (e) => e.id,
  fromRow: rowToEdge, toRow: edgeToRow, insertAt: 'end',
});

export const cards = createCollection<ExtendedContentPipeline>({
  table: 'pipeline_cards', lsKey: 'pronoia_cards', idOf: (c) => c.id,
  fromRow: rowToCard, toRow: cardToRow, stampUpdatedAt: true, insertAt: 'end',
});

/** Every edge touching a node — the cascade set when that node is deleted. */
export function edgesTouching(nodeId: string): Edge[] {
  return edges.getAll().filter((e) => e.sourceId === nodeId || e.targetId === nodeId);
}

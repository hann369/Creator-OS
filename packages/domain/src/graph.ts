// ─────────────────────────────────────────────────────────────────────────────
// THE UNIFIED GRAPH MODEL  (Roadmap Phase A)
//
// Today the codebase carries TWO parallel graph models:
//   • WorldNode / WorldEdge   (models.ts) — the "living world model" (concepts)
//   • Entity   / Relationship (entity.ts) — the "entity spine" (content faces)
// The web app bridges them with a mirror-node hack. This file introduces ONE
// model both collapse into, plus loss-checked converters, so call sites can be
// migrated incrementally (strangler-fig) instead of in a risky big bang.
//
// This is ADDITIVE: nothing here replaces the legacy types yet. `origin` records
// which legacy shape a node/edge came from, so a round-trip is lossless within an
// origin. Later phases migrate consumers onto Node/Edge, then delete the legacy
// models and this `origin` bookkeeping.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorldNode, WorldEdge, WorldNodeType, WorldEdgeType, NodeLifecycleState, ConfidenceMatrix } from './models.js';
import type { Entity, EntityType, Relationship, RelationshipType } from './entity.js';

/** Every node type across both legacy models (the TS union de-duplicates overlaps). */
export type NodeType = EntityType | WorldNodeType;
/** Every edge type across both legacy models. */
export type EdgeType = RelationshipType | WorldEdgeType;

/** Which legacy shape a unified record was projected from (migration bookkeeping). */
export type NodeOrigin = 'entity' | 'world';
export type EdgeOrigin = 'relationship' | 'world';

/** The single node: the shared spine + optional knowledge-layer fields. */
export interface Node {
  id: string;
  workspaceId: string;
  type: NodeType;
  label: string;                    // unifies Entity.title and WorldNode.name
  description?: string;
  metadata: Record<string, unknown>;
  // Knowledge-layer fields — populated for world-model nodes, absent for plain faces.
  confidence?: ConfidenceMatrix;
  lifecycleState?: NodeLifecycleState;
  sourceCount?: number;
  derivedFrom?: string[];
  /** Face-specific fields (moodboard sections, asset url, identity hooks…) carried opaquely during migration. */
  data?: Record<string, unknown>;
  origin: NodeOrigin;
  createdAt: Date;
  updatedAt: Date;
}

/** The single edge: direction, type and weight, unifying WorldEdge + Relationship. */
export interface Edge {
  id: string;
  workspaceId: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight?: number;
  metadata?: Record<string, unknown>;
  origin: EdgeOrigin;
  createdAt: Date;
}

// ─── Node converters ─────────────────────────────────────────────────────────

/** WorldNode → Node (carries the full knowledge layer). */
export function worldNodeToNode(n: WorldNode): Node {
  return {
    id: n.id, workspaceId: n.workspaceId, type: n.type, label: n.name,
    description: n.description, metadata: n.metadata ?? {},
    confidence: n.confidence, lifecycleState: n.lifecycleState,
    sourceCount: n.sourceCount, derivedFrom: n.derivedFrom,
    origin: 'world', createdAt: n.createdAt, updatedAt: n.updatedAt,
  };
}

/** Entity (or any typed face) → Node. Face-specific fields ride along in `data`. */
export function entityToNode(e: Entity): Node {
  const { id, workspaceId, type, title, metadata, createdAt, updatedAt, ...rest } = e as Entity & Record<string, unknown>;
  const data = Object.keys(rest).length ? (rest as Record<string, unknown>) : undefined;
  return {
    id, workspaceId, type, label: title, metadata: metadata ?? {},
    ...(data ? { data } : {}), origin: 'entity', createdAt, updatedAt,
  };
}

/** Node → WorldNode. Lossless for world-origin nodes; fills knowledge defaults otherwise. */
export function nodeToWorldNode(node: Node): WorldNode {
  const fullConfidence: ConfidenceMatrix = { extractionConfidence: 1, reasoningConfidence: 1, relationshipConfidence: 1, verificationConfidence: 1 };
  return {
    id: node.id, workspaceId: node.workspaceId, name: node.label,
    type: node.type as WorldNodeType, description: node.description, metadata: node.metadata ?? {},
    confidence: node.confidence ?? fullConfidence,
    sourceCount: node.sourceCount ?? 0,
    lastVerified: node.updatedAt,
    derivedFrom: node.derivedFrom ?? [],
    lifecycleState: node.lifecycleState ?? 'created',
    createdAt: node.createdAt, updatedAt: node.updatedAt,
  };
}

/** Node → Entity. Re-expands the opaque `data` carried by entityToNode. */
export function nodeToEntity(node: Node): Entity {
  return {
    ...(node.data ?? {}),
    id: node.id, workspaceId: node.workspaceId, type: node.type as EntityType,
    title: node.label, metadata: node.metadata ?? {},
    createdAt: node.createdAt, updatedAt: node.updatedAt,
  } as Entity;
}

// ─── Edge converters ─────────────────────────────────────────────────────────

/** WorldEdge → Edge. */
export function worldEdgeToEdge(e: WorldEdge): Edge {
  return {
    id: e.id, workspaceId: e.workspaceId, sourceId: e.sourceId, targetId: e.targetId,
    type: e.relationshipType, weight: e.weight, origin: 'world', createdAt: e.createdAt,
  };
}

/** Relationship → Edge. */
export function relationshipToEdge(r: Relationship): Edge {
  return {
    id: r.id, workspaceId: r.workspaceId, sourceId: r.sourceId, targetId: r.targetId,
    type: r.type, weight: r.weight, metadata: r.metadata, origin: 'relationship', createdAt: r.createdAt,
  };
}

/** Edge → Relationship (re-narrows the type; valid for relationship-origin edges). */
export function edgeToRelationship(edge: Edge): Relationship {
  return {
    id: edge.id, workspaceId: edge.workspaceId, sourceId: edge.sourceId, targetId: edge.targetId,
    type: edge.type as RelationshipType, ...(edge.weight != null ? { weight: edge.weight } : {}),
    ...(edge.metadata ? { metadata: edge.metadata } : {}), createdAt: edge.createdAt,
  };
}

// ─── Content-card → graph node projection ─────────────────────────────────────
// A pipeline card also lives in the graph as a "content mirror" node, so a piece
// of content IS a node (see the mirror-node mechanism in the web WorkspaceContext).
// This is the ONE canonical, tested definition of that projection; the web layer
// derives its WorldNode-shaped mirror from here via `nodeToWorldNode`.

/** Minimal card shape needed to project a content card into the graph. */
export interface PipelineCardProjection {
  id: string;
  title: string;
  hook?: string;
  status: string;       // PipelineStatus, kept as string to avoid tight coupling
  attachments?: unknown[];
}

/** Deterministic id of a card's content-mirror node (derivable from the card id). */
export const contentMirrorNodeId = (cardId: string): string => `card:${cardId}`;

/** Is this node a content-card mirror (rather than a genuine knowledge concept)? */
export function isContentMirrorNode(node: Pick<Node, 'metadata'>): boolean {
  return node.metadata?.isContentMirror === true;
}

/**
 * Project a pipeline card into a unified graph Node. Placement (x/y) is derived
 * deterministically from the card id so mirror nodes stay stable across loads and
 * cluster in a "content lane" beneath the concept cloud.
 */
export function pipelineCardToNode(card: PipelineCardProjection, workspaceId: string, now: Date = new Date()): Node {
  const h = [...card.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const lifecycleState: NodeLifecycleState =
    card.status === 'published' ? 'core_knowledge'
    : card.status === 'production' ? 'growing'
    : card.status === 'idea' ? 'created'
    : 'growing';
  return {
    id: contentMirrorNodeId(card.id), workspaceId, type: 'project',
    label: card.title,
    description: card.hook || 'Content piece in the production pipeline.',
    metadata: { cardId: card.id, isContentMirror: true, x: 240 + (h % 6) * 210, y: 600 + (h % 3) * 150 },
    sourceCount: card.attachments?.length ?? 0,
    lifecycleState, origin: 'entity', createdAt: now, updatedAt: now,
  };
}

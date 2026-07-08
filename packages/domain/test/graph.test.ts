import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldNode, WorldEdge, Relationship } from '../src/index.ts';
import type { Moodboard } from '../src/index.ts';
import {
  worldNodeToNode, nodeToWorldNode, entityToNode, nodeToEntity,
  worldEdgeToEdge, relationshipToEdge, edgeToRelationship,
  pipelineCardToNode, contentMirrorNodeId, isContentMirrorNode,
} from '../src/graph.ts';

const conf = { extractionConfidence: 0.9, reasoningConfidence: 0.8, relationshipConfidence: 0.7, verificationConfidence: 1 };
const now = new Date('2026-07-04T10:00:00Z');

// ─── Node round-trips ────────────────────────────────────────────────────────
test('WorldNode → Node → WorldNode is lossless on the identifying fields', () => {
  const wn: WorldNode = {
    id: 'n1', workspaceId: 'ws', name: 'Multi-Agent Systems', type: 'concept',
    description: 'Coordination networks', metadata: { x: 1, y: 2 }, confidence: conf,
    sourceCount: 8, lastVerified: now, derivedFrom: ['doc-1'], lifecycleState: 'core_knowledge',
    createdAt: now, updatedAt: now,
  };
  const node = worldNodeToNode(wn);
  assert.equal(node.label, 'Multi-Agent Systems');
  assert.equal(node.origin, 'world');

  const back = nodeToWorldNode(node);
  assert.equal(back.name, wn.name);
  assert.equal(back.type, wn.type);
  assert.equal(back.description, wn.description);
  assert.equal(back.lifecycleState, wn.lifecycleState);
  assert.equal(back.sourceCount, wn.sourceCount);
  assert.deepEqual(back.derivedFrom, wn.derivedFrom);
  assert.deepEqual(back.metadata, wn.metadata);
});

test('Entity (typed face) → Node → Entity preserves the spine and face-specific data', () => {
  // A Moodboard is a typed Entity face with extra fields (client, palette, sections…).
  const mb: Moodboard = {
    id: 'mb-1', workspaceId: 'ws', type: 'moodboard', title: 'Brand Deck', metadata: {},
    boardType: 'custom', client: 'Acme', subtitle: 'v1', note: '', description: 'desc', tags: ['a'],
    palette: [{ hex: '#111' }], fonts: { title: 'Anton', subheading: 'Archivo', caption: 'Inter' },
    status: 'active', sections: [], notes: 'n', createdAt: now, updatedAt: now,
  };
  const node = entityToNode(mb);
  assert.equal(node.label, 'Brand Deck');
  assert.equal(node.type, 'moodboard');
  assert.equal(node.origin, 'entity');

  const back = nodeToEntity(node) as Moodboard;
  assert.equal(back.id, mb.id);
  assert.equal(back.title, mb.title);
  assert.equal(back.client, 'Acme', 'face-specific field survives the round-trip');
  assert.deepEqual(back.palette, mb.palette);
});

// ─── Edge round-trips ────────────────────────────────────────────────────────
test('WorldEdge → Edge carries direction, type and weight', () => {
  const we: WorldEdge = {
    id: 'e1', workspaceId: 'ws', sourceId: 'a', targetId: 'b', weight: 0.9,
    relationshipType: 'supports', confidence: conf, createdAt: now,
  };
  const edge = worldEdgeToEdge(we);
  assert.deepEqual(
    { s: edge.sourceId, t: edge.targetId, type: edge.type, w: edge.weight, o: edge.origin },
    { s: 'a', t: 'b', type: 'supports', w: 0.9, o: 'world' },
  );
});

test('Relationship → Edge → Relationship is lossless', () => {
  const rel: Relationship = {
    id: 'r1', workspaceId: 'ws', sourceId: 'card-1', targetId: 'mb-1',
    type: 'styled_by', weight: 0.5, metadata: { note: 'x' }, createdAt: now,
  };
  const back = edgeToRelationship(relationshipToEdge(rel));
  assert.deepEqual(back, rel);
});

// ─── Content-card → node projection ──────────────────────────────────────────
test('pipelineCardToNode projects a card into a stable content-mirror node', () => {
  const card = { id: 'card-abc', title: 'Multi-Agent Intro', hook: 'why agents win', status: 'production', attachments: [{}, {}] };
  const node = pipelineCardToNode(card, 'ws', now);

  assert.equal(node.id, contentMirrorNodeId('card-abc'));
  assert.equal(node.id, 'card:card-abc');
  assert.equal(node.type, 'project');
  assert.equal(node.label, 'Multi-Agent Intro');
  assert.equal(node.description, 'why agents win');
  assert.equal(node.lifecycleState, 'growing');            // production → growing
  assert.equal(node.sourceCount, 2);                        // attachments.length
  assert.equal(node.metadata.isContentMirror, true);
  assert.ok(isContentMirrorNode(node));
  // placement is deterministic (stable across loads) and lives in the content lane (y ≥ 600)
  assert.equal(typeof node.metadata.x, 'number');
  assert.ok((node.metadata.y as number) >= 600);
  const again = pipelineCardToNode(card, 'ws', now);
  assert.deepEqual(again.metadata, node.metadata);
});

test('pipelineCardToNode → nodeToWorldNode reproduces the legacy mirror-node shape', () => {
  const card = { id: 'card-xyz', title: 'Draft', status: 'published' as const };
  const wn = nodeToWorldNode(pipelineCardToNode(card, 'ws', now));
  assert.equal(wn.id, 'card:card-xyz');
  assert.equal(wn.name, 'Draft');
  assert.equal(wn.type, 'project');
  assert.equal(wn.lifecycleState, 'core_knowledge');       // published → core_knowledge
  assert.equal(wn.metadata.isContentMirror, true);
  assert.equal(wn.metadata.cardId, 'card-xyz');
  // confidence is defaulted to full by nodeToWorldNode (matches the old buildMirrorNode)
  assert.equal(wn.confidence.verificationConfidence, 1);
});

test('both node models collapse into one NodeType space (concept exists in both origins)', () => {
  // A 'concept' from the world model and a 'moodboard' from the entity spine are
  // both valid Node.type values — the unification target is a single space.
  const a = worldNodeToNode({
    id: 'x', workspaceId: 'ws', name: 'c', type: 'concept', metadata: {}, confidence: conf,
    sourceCount: 0, lastVerified: now, derivedFrom: [], lifecycleState: 'created', createdAt: now, updatedAt: now,
  });
  assert.equal(a.type, 'concept');
});

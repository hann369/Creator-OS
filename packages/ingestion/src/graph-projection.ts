import type { WorldNode, WorldEdge, WorldNodeType, WorldEdgeType, ConfidenceMatrix } from '@pronoia/domain';
import type { GraphRepository } from '@pronoia/services';
import type { ContentEntry, VideoAnalysis } from './content-model.js';

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Graph Integration (Phase 7).
//
// Projects a VideoAnalysis into the cognitive World Model. Content itself stays
// in its own store (content_entries); here we only create the *knowledge* nodes
// and connect them. Every projected node lists the content entry id in
// derivedFrom, so provenance is preserved.
//
// Node mapping (no enum extension — reuse existing cognitive types):
//   topic / subTopics            → concept
//   hookPattern/seedPattern/mech → principle
//   actionableTakeaways          → insight
//   scientificReferences         → resource
//   creator                      → person
// ─────────────────────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function nodeId(type: WorldNodeType, name: string): string {
  return `${type}:${slug(name)}`;
}

const CONFIDENCE = (analysisConfidence: number): ConfidenceMatrix => ({
  extractionConfidence: analysisConfidence,
  reasoningConfidence: analysisConfidence,
  relationshipConfidence: 0.7,
  verificationConfidence: 0,
});

export interface GraphProjection {
  nodes: WorldNode[];
  edges: WorldEdge[];
}

/** Pure: turn a ContentEntry + analysis into a set of nodes and edges. */
export function projectAnalysis(entry: ContentEntry, analysis: VideoAnalysis): GraphProjection {
  const now = new Date();
  const conf = CONFIDENCE(analysis.confidence);
  const nodes: WorldNode[] = [];
  const edges: WorldEdge[] = [];
  const seen = new Set<string>();

  const addNode = (type: WorldNodeType, name: string, description?: string): string | null => {
    if (!name || !name.trim()) return null;
    const id = nodeId(type, name);
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({
        id,
        workspaceId: entry.workspaceId,
        name: name.trim(),
        type,
        description,
        metadata: { extractedFrom: entry.id, platform: entry.platform, sourceType: 'content' },
        confidence: conf,
        sourceCount: 1,
        lastVerified: now,
        derivedFrom: [entry.id],
        lifecycleState: 'created',
        lastActivityAt: now,
        velocityScore: 0.1,
        createdAt: now,
        updatedAt: now,
      });
    }
    return id;
  };

  const addEdge = (sourceId: string | null, targetId: string | null, type: WorldEdgeType, weight = 0.8) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    edges.push({
      id: `edge-${sourceId}-${targetId}`,
      workspaceId: entry.workspaceId,
      sourceId,
      targetId,
      weight,
      relationshipType: type,
      confidence: conf,
      createdAt: now,
    });
  };

  const topicId = addNode('concept', analysis.topic, analysis.promise);

  for (const sub of analysis.subTopics) {
    addEdge(addNode('concept', sub), topicId, 'belongs_to', 0.7);
  }

  // Hook / seed / mechanism / story-structure → principle nodes supporting the topic.
  for (const p of [analysis.hookPattern, analysis.seedPattern, analysis.mechanism, analysis.storyStructure]) {
    addEdge(addNode('principle', p), topicId, 'supports', 0.75);
  }

  for (const t of analysis.actionableTakeaways) {
    addEdge(addNode('insight', t), topicId, 'supports', 0.7);
  }

  for (const ref of analysis.scientificReferences) {
    addEdge(topicId, addNode('resource', ref), 'references', 0.8);
  }

  if (entry.creator) {
    addEdge(addNode('person', entry.creator), topicId, 'mentions', 0.6);
  }

  return { nodes, edges };
}

/**
 * Persist a projection, merging into existing nodes/edges (sourceCount++,
 * derivedFrom union) — same strategy as IngestionEngine.saveToGraph.
 */
export async function persistProjection(projection: GraphProjection, repo: GraphRepository): Promise<void> {
  const tx = await repo.beginTransaction();
  try {
    for (const node of projection.nodes) {
      const existing = await repo.findNode(node.id);
      if (existing) {
        await repo.saveNode(
          {
            ...existing,
            sourceCount: existing.sourceCount + 1,
            derivedFrom: [...new Set([...existing.derivedFrom, ...node.derivedFrom])],
            lastActivityAt: new Date(),
            updatedAt: new Date(),
          },
          tx,
        );
      } else {
        await repo.saveNode(node, tx);
      }
    }
    for (const edge of projection.edges) {
      const existing = await repo.findEdge(edge.sourceId, edge.targetId);
      if (!existing) await repo.saveEdge(edge, tx);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

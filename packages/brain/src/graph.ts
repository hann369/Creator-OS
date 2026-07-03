import { WorldEdge, WorldNode, WorldEdgeType } from '@pronoia/domain';
import { Embedder } from './embedder.js';

export class SemanticGraphBuilder {
  // Compute vector similarities between new node and all existing nodes, generating edges if threshold met
  static async discoverRelationships(
    workspaceId: string,
    newNode: WorldNode,
    newNodeVector: number[],
    existingNodes: { node: WorldNode; vector: number[] }[],
    similarityThreshold = 0.78
  ): Promise<WorldEdge[]> {
    const newEdges: WorldEdge[] = [];

    const defaultConfidence = {
      extractionConfidence: 0.90,
      reasoningConfidence: 0.80,
      relationshipConfidence: 0.85,
      verificationConfidence: 0.0
    };

    for (const item of existingNodes) {
      if (item.node.id === newNode.id) {
        continue;
      }

      const similarity = Embedder.cosineSimilarity(newNodeVector, item.vector);
      if (similarity >= similarityThreshold) {
        newEdges.push({
          id: crypto.randomUUID(),
          workspaceId,
          sourceId: newNode.id,
          targetId: item.node.id,
          weight: parseFloat(similarity.toFixed(4)),
          relationshipType: 'related_to' as WorldEdgeType,
          confidence: defaultConfidence,
          createdAt: new Date()
        });
      }
    }

    return newEdges;
  }
}

import type { WorldNode, WorldEdge, ConfidenceMatrix } from '@pronoia/domain';

export interface CompressionResult {
  consolidatedNodes: WorldNode[];
  edgesToCreate: WorldEdge[];
  nodesToDelete: string[];
  edgesToDelete: string[];
}

/**
 * MemoryCompressionEngine: Implements brain-like abstraction and consolidation.
 * Periodically shrinks the knowledge graph by merging granular ideas into core principles:
 *   100 Raw Thoughts ➔ 15 Concepts ➔ 4 Principles ➔ 1 Mental Model
 */
export class MemoryCompressionEngine {
  /**
   * Identifies candidate nodes for consolidation and returns instructions to compress the graph.
   * Groups aging/dormant concept/insight nodes that are linked, merging them into a new 'principle' node.
   */
  static compress(
    nodes: WorldNode[],
    edges: WorldEdge[],
    workspaceId: string
  ): CompressionResult {
    const consolidatedNodes: WorldNode[] = [];
    const edgesToCreate: WorldEdge[] = [];
    const nodesToDelete: string[] = [];
    const edgesToDelete: string[] = [];

    // Filter candidate nodes for compression (concept/insight/belief, aging or dormant or created with low source count)
    const candidates = nodes.filter(n =>
      (n.type === 'concept' || n.type === 'insight' || n.type === 'belief') &&
      (n.lifecycleState === 'aging' || n.lifecycleState === 'dormant' || n.sourceCount <= 1)
    );

    if (candidates.length < 3) {
      // Not enough nodes to justify compression
      return { consolidatedNodes, edgesToCreate, nodesToDelete, edgesToDelete };
    }

    // Heuristic: Group candidates that share links
    const visited = new Set<string>();
    const defaultConfidence: ConfidenceMatrix = {
      extractionConfidence: 0.90,
      reasoningConfidence: 0.85,
      relationshipConfidence: 0.80,
      verificationConfidence: 0.70
    };

    // We will group nodes in clusters of size 3 to 10
    let clusterIndex = 1;
    for (const startNode of candidates) {
      if (visited.has(startNode.id)) continue;

      const cluster: WorldNode[] = [startNode];
      visited.add(startNode.id);

      // Find neighbor candidates linked to this startNode
      const neighbors = edges
        .filter(e => e.sourceId === startNode.id || e.targetId === startNode.id)
        .map(e => e.sourceId === startNode.id ? e.targetId : e.sourceId)
        .map(id => candidates.find(c => c.id === id))
        .filter((n): n is WorldNode => !!n && !visited.has(n.id));

      for (const neighbor of neighbors) {
        if (cluster.length >= 5) break; // Limit cluster size to 5 nodes
        cluster.push(neighbor);
        visited.add(neighbor.id);
      }

      if (cluster.length >= 3) {
        // We have a cluster to consolidate!
        const clusterNodeIds = new Set(cluster.map(c => c.id));
        const names = cluster.map(c => c.name);
        const descriptions = cluster.map(c => c.description ?? c.name);

        // Create a consolidated 'principle' node
        const consolidatedNodeId = `principle:consolidated-cluster-${Date.now()}-${clusterIndex++}`;
        const consolidatedNode: WorldNode = {
          id: consolidatedNodeId,
          workspaceId,
          name: `Konsolidiertes Prinzip: ${names.slice(0, 2).join(' & ')}`,
          type: 'principle',
          description: `Ein übergeordnetes Prinzip, welches folgende Einzelgedanken zusammenfasst: ${descriptions.join('; ')}`,
          metadata: {
            isConsolidated: true,
            compressedNodesCount: cluster.length,
            originalNodeIds: [...clusterNodeIds]
          },
          confidence: defaultConfidence,
          sourceCount: cluster.reduce((sum, c) => sum + c.sourceCount, 0),
          lastVerified: new Date(),
          derivedFrom: [...new Set(cluster.flatMap(c => c.derivedFrom))],
          lifecycleState: 'stable',
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        consolidatedNodes.push(consolidatedNode);

        // Mark clustered nodes for deletion
        cluster.forEach(c => nodesToDelete.push(c.id));

        // Mark edges between clustered nodes for deletion
        const clusterEdges = edges.filter(e =>
          clusterNodeIds.has(e.sourceId) && clusterNodeIds.has(e.targetId)
        );
        clusterEdges.forEach(e => edgesToDelete.push(e.id));

        // Reroute external edges connected to the cluster to the new consolidated node
        const externalEdges = edges.filter(e =>
          (clusterNodeIds.has(e.sourceId) && !clusterNodeIds.has(e.targetId)) ||
          (!clusterNodeIds.has(e.sourceId) && clusterNodeIds.has(e.targetId))
        );

        externalEdges.forEach(edge => {
          edgesToDelete.push(edge.id);
          const isSource = clusterNodeIds.has(edge.sourceId);
          const newEdge: WorldEdge = {
            id: `edge-consolidated-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            workspaceId,
            sourceId: isSource ? consolidatedNodeId : edge.sourceId,
            targetId: isSource ? edge.targetId : consolidatedNodeId,
            weight: edge.weight,
            relationshipType: edge.relationshipType,
            confidence: edge.confidence,
            createdAt: new Date()
          };
          edgesToCreate.push(newEdge);
        });
      }
    }

    return {
      consolidatedNodes,
      edgesToCreate,
      nodesToDelete,
      edgesToDelete
    };
  }

  /**
   * Applies the compression results to the graph repository
   */
  static async executeCompression(
    workspaceId: string,
    nodes: WorldNode[],
    edges: WorldEdge[],
    graphRepo: any
  ): Promise<void> {
    const result = this.compress(nodes, edges, workspaceId);

    if (result.consolidatedNodes.length === 0) {
      console.log('[MemoryCompression] No candidates for compression.');
      return;
    }

    const tx = await graphRepo.beginTransaction();
    try {
      // 1. Delete old edges
      for (const edgeId of result.edgesToDelete) {
        // find source and target of the edge
        const edge = edges.find(e => e.id === edgeId);
        if (edge) {
          await graphRepo.deleteEdge(edge.sourceId, edge.targetId, tx);
        }
      }

      // 2. Delete consolidated nodes
      for (const nodeId of result.nodesToDelete) {
        await graphRepo.deleteNode(nodeId, tx);
      }

      // 3. Save new consolidated nodes
      for (const node of result.consolidatedNodes) {
        await graphRepo.saveNode(node, tx);
      }

      // 4. Save rerouted edges
      for (const edge of result.edgesToCreate) {
        await graphRepo.saveEdge(edge, tx);
      }

      await tx.commit();
      console.log(`[MemoryCompression] Compressed ${result.nodesToDelete.length} nodes into ${result.consolidatedNodes.length} principles.`);
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }
}

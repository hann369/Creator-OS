import type { WorldNode, WorldEdge, NodeIdentity, NodeIdentityEntry } from '@pronoia/domain';

const DRIFT_THRESHOLD = 0.20; // Semantic drift above this triggers a flag (as requested, conservative)

/**
 * IdentityEngine: Computes and tracks the emergent semantic identity of a knowledge node.
 * 
 * Emergent Identity = Meaning + Context + History + Relationships + Usage
 */
export class IdentityEngine {
  /**
   * Derives a full NodeIdentity from the node's current graph position and evidence.
   */
  static compute(
    node: WorldNode,
    allNodes: WorldNode[],
    allEdges: WorldEdge[]
  ): NodeIdentity {
    // 1. RELATIONSHIPS & CONTEXT (Graph structure neighbors)
    const connectedEdges = allEdges.filter(
      e => (e.sourceId === node.id || e.targetId === node.id) && e.weight > 0.5
    );
    const relationalIdentity = [
      ...new Set(connectedEdges.map(e => e.sourceId === node.id ? e.targetId : e.sourceId))
    ];

    // 2. USAGE (Centrality, Access Frequency & Recency)
    const degree = connectedEdges.length;
    const maxDegree = Math.max(...allNodes.map(n => {
      return allEdges.filter(e => e.sourceId === n.id || e.targetId === n.id).length;
    }), 1);
    const centralityScore = degree / maxDegree;

    const daysSinceActivity = node.lastActivityAt
      ? (Date.now() - node.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
      : (Date.now() - node.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
    const recencyScore = Math.max(0, 1 - daysSinceActivity / 90); // 90 days decay for usage

    const isGoal = node.type === 'goal';
    const nearGoal = allEdges.some(e =>
      (e.sourceId === node.id || e.targetId === node.id) &&
      allNodes.find(n => n.id === (e.sourceId === node.id ? e.targetId : e.sourceId))?.type === 'goal'
    );
    const goalProximity = isGoal ? 1.0 : nearGoal ? 0.7 : 0.3;

    const importanceScore = parseFloat(
      ((centralityScore * 0.4 + recencyScore * 0.35 + goalProximity * 0.25)).toFixed(3)
    );

    // 3. MEANING (Current best definition including usage attributes)
    const contextSummary = relationalIdentity.length > 0 
      ? ` Verbunden mit: ${relationalIdentity.slice(0, 3).map(id => id.split(':').pop()).join(', ')}.`
      : '';
    const coreMeaning = node.description
      ?? `${node.type.charAt(0).toUpperCase() + node.type.slice(1)}-Konzept mit ${node.sourceCount} Belegen und ${degree} Kanten.${contextSummary}`;

    // 4. HISTORY (Evolution log & drift over time)
    const existingLog: NodeIdentityEntry[] = node.identity?.evolutionLog ?? [
      { timestamp: node.createdAt, coreMeaning: `Erstellt als "${node.name}".` }
    ];

    const previousMeaning = node.identity?.coreMeaning;
    const evolutionLog: NodeIdentityEntry[] = [...existingLog];
    if (previousMeaning && previousMeaning !== coreMeaning) {
      evolutionLog.push({ timestamp: new Date(), coreMeaning });
    }

    // Drift accumulates as the semantic meaning and relationships shift over time
    const relationDrift = previousMeaning && previousMeaning !== coreMeaning ? 0.15 : 0.0;
    const velocityDrift = node.velocityScore ?? 0;
    const semanticDrift = parseFloat(Math.min(node.identity?.semanticDrift ?? 0 + velocityDrift * 0.5 + relationDrift, 1.0).toFixed(3));

    return {
      coreMeaning,
      importanceScore,
      semanticDrift,
      relationalIdentity,
      evolutionLog
    };
  }

  /**
   * Detects meaningful semantic drift compared to a previous identity snapshot.
   */
  static detectDrift(
    currentIdentity: NodeIdentity,
    previousIdentity: NodeIdentity
  ): { drifted: boolean; delta: number; diagnosis: string } {
    const delta = Math.abs(currentIdentity.semanticDrift - previousIdentity.semanticDrift);
    const drifted = delta > DRIFT_THRESHOLD;

    let diagnosis = 'Bedeutung stabil — keine signifikante Verschiebung.';
    if (drifted) {
      if (currentIdentity.semanticDrift > previousIdentity.semanticDrift) {
        diagnosis = `Semantische Drift erkannt (+${(delta * 100).toFixed(0)}%). Die Bedeutung dieses Konzepts entwickelt sich aktiv — Neubewertung empfohlen.`;
      } else {
        diagnosis = `Bedeutungskonsolidierung beobachtet (−${(delta * 100).toFixed(0)}%). Das Konzept stabilisiert sich.`;
      }
    }

    return { drifted, delta: parseFloat(delta.toFixed(3)), diagnosis };
  }

  /**
   * Batch-computes identities for all nodes in a graph.
   */
  static computeAll(
    nodes: WorldNode[],
    edges: WorldEdge[]
  ): Map<string, NodeIdentity> {
    const result = new Map<string, NodeIdentity>();
    for (const node of nodes) {
      result.set(node.id, IdentityEngine.compute(node, nodes, edges));
    }
    return result;
  }
}

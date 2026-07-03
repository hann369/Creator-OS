import type { WorldNode, WorldEdge } from '@pronoia/domain';

export interface KnowledgeQualityMetrics {
  consistencyScore: number;     // 1.0 (no contradictions) to 0.0 (high conflicts)
  completenessScore: number;    // 1.0 (fully filled metadata) to 0.0
  averageAgeDays: number;       // Average days since last node update
  orphanNodeRate: number;       // Ratio of unconnected nodes (0.0 to 1.0)
  averageEvidenceDensity: number; // Average count of source documents per node
}

export class KnowledgeEvaluator {
  static evaluate(nodes: WorldNode[], edges: WorldEdge[]): KnowledgeQualityMetrics {
    const nodeCount = nodes.length;
    if (nodeCount === 0) {
      return {
        consistencyScore: 1.0,
        completenessScore: 1.0,
        averageAgeDays: 0,
        orphanNodeRate: 0.0,
        averageEvidenceDensity: 0.0
      };
    }

    // 1. Consistency Score (deduct for conflicts / contradictions)
    const contradictions = edges.filter(e => e.relationshipType === 'contradicts').length;
    const consistencyScore = Math.max(0, 1.0 - (contradictions / Math.max(1, edges.length)) * 2);

    // 2. Completeness Score (check if description and metadata are filled)
    let filledCount = 0;
    nodes.forEach(n => {
      let score = 0;
      if (n.description && n.description.trim().length > 0) score += 0.5;
      if (n.metadata && Object.keys(n.metadata).length > 0) score += 0.5;
      filledCount += score;
    });
    const completenessScore = filledCount / nodeCount;

    // 3. Average Age (Days)
    const now = new Date().getTime();
    const totalAgeMs = nodes.reduce((sum, n) => sum + (now - n.updatedAt.getTime()), 0);
    const averageAgeDays = parseFloat((totalAgeMs / (1000 * 60 * 60 * 24) / nodeCount).toFixed(1));

    // 4. Orphan Node Rate
    const connectedNodeIds = new Set<string>();
    edges.forEach(e => {
      connectedNodeIds.add(e.sourceId);
      connectedNodeIds.add(e.targetId);
    });
    let orphans = 0;
    nodes.forEach(n => {
      if (!connectedNodeIds.has(n.id)) {
        orphans++;
      }
    });
    const orphanNodeRate = parseFloat((orphans / nodeCount).toFixed(2));

    // 5. Average Evidence Density
    const totalEvidence = nodes.reduce((sum, n) => sum + (n.derivedFrom?.length || 0), 0);
    const averageEvidenceDensity = parseFloat((totalEvidence / nodeCount).toFixed(1));

    return {
      consistencyScore,
      completenessScore,
      averageAgeDays,
      orphanNodeRate,
      averageEvidenceDensity
    };
  }
}

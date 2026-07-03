import type { WorldNode, WorldEdge } from '@pronoia/domain';

export interface WhyNowReason {
  type: 'trend' | 'neglect' | 'relation' | 'goal';
  description: string;
}

export class WhyNowCalculator {
  static calculate(
    node: WorldNode,
    allNodes: WorldNode[],
    allEdges: WorldEdge[]
  ): WhyNowReason[] {
    const reasons: WhyNowReason[] = [];
    const now = new Date().getTime();

    // 1. Neglect Check: check if the concept node hasn't been edited for more than 10 days
    const msSinceUpdate = now - node.updatedAt.getTime();
    const daysSinceUpdate = Math.floor(msSinceUpdate / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate >= 10) {
      reasons.push({
        type: 'neglect',
        description: `Du hast dieses Thema seit ${daysSinceUpdate} Tagen nicht weiterentwickelt.`
      });
    }

    // 2. Goal Alignment Check: check if node supports an active goal
    const activeGoals = allNodes.filter(n => n.type === 'goal');
    const connectedEdges = allEdges.filter(
      e => (e.sourceId === node.id || e.targetId === node.id) && e.relationshipType === 'supports'
    );
    
    const supportsGoal = connectedEdges.some(e => {
      const targetId = e.sourceId === node.id ? e.targetId : e.sourceId;
      return activeGoals.some(g => g.id === targetId);
    });

    if (supportsGoal) {
      reasons.push({
        type: 'goal',
        description: `Dieses Thema unterstützt direkt dein aktives Workspace-Ziel.`
      });
    }

    // 3. Trend Spike Check: check metadata for simulated search volume trends
    if (node.metadata && node.metadata.searchTrendVolumeIncrease) {
      reasons.push({
        type: 'trend',
        description: `Das Suchvolumen für dieses Thema ist diese Woche um ${node.metadata.searchTrendVolumeIncrease}% gestiegen.`
      });
    }

    // 4. Related Research Check: check if there are multiple documents referencing this node
    const relatedDocsCount = node.derivedFrom?.length || 0;
    if (relatedDocsCount >= 3) {
      reasons.push({
        type: 'relation',
        description: `${relatedDocsCount} aktuelle Research-Dokumente behandeln dasselbe Thema.`
      });
    }

    // Fallback: If no reasons are triggered, provide a default activity driver
    if (reasons.length === 0) {
      reasons.push({
        type: 'relation',
        description: 'Empfohlen zur Konsolidierung deines Wissensnetzwerks.'
      });
    }

    return reasons;
  }
}

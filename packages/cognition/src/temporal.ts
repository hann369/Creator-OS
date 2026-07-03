import type { WorldNode } from '@pronoia/domain';

export interface TemporalSnapshot {
  nodeId: string;
  nodeName: string;
  periodDays: number;
  interactionCount: number;
  evidenceCount: number;
  velocity: number;         // Change rate: positive = growing, negative = declining
  trend: 'rising' | 'stable' | 'declining' | 'stagnant';
  diagnosis: string;
}

/**
 * TemporalReasoner: Tracks velocity and trend direction for world model nodes.
 * Identifies which concepts are rising, stagnating, or dying.
 */
export class TemporalReasoner {
  /**
   * Analyzes a set of nodes and computes velocity and trend for each.
   * In production this would compare against a historical time-series store.
   * Here we derive from node metadata and timestamps.
   */
  static analyze(nodes: WorldNode[], periodDays = 30): TemporalSnapshot[] {
    const now = Date.now();
    const periodMs = periodDays * 24 * 60 * 60 * 1000;

    return nodes.map(node => {
      const ageMs = now - node.createdAt.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);

      const daysSinceActivity = node.lastActivityAt
        ? (now - node.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
        : ageDays;

      // Velocity derived from source evidence growth vs inactivity
      const evidenceRate = node.sourceCount / Math.max(ageDays, 1);
      const recentActivityFactor = Math.max(0, 1 - daysSinceActivity / periodDays);
      const velocity = parseFloat((evidenceRate * recentActivityFactor).toFixed(3));

      // Trend classification
      let trend: TemporalSnapshot['trend'];
      let diagnosis: string;

      if (velocity > 0.3) {
        trend = 'rising';
        diagnosis = `"${node.name}" gewinnt schnell an Bedeutung. Ideal für Content-Ausbau jetzt.`;
      } else if (velocity > 0.1) {
        trend = 'stable';
        diagnosis = `"${node.name}" ist stabil etabliert. Halte Verbindungen aktiv.`;
      } else if (daysSinceActivity > periodDays * 1.5) {
        trend = 'stagnant';
        diagnosis = `"${node.name}" ist seit ${Math.round(daysSinceActivity)} Tagen inaktiv. Archivierung erwägen.`;
      } else {
        trend = 'declining';
        diagnosis = `"${node.name}" verliert an Relevanz. Beziehungen überprüfen oder Knoten neu beleben.`;
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        periodDays,
        interactionCount: Math.round(recentActivityFactor * 10),
        evidenceCount: node.sourceCount,
        velocity,
        trend,
        diagnosis
      };
    });
  }

  /**
   * Returns the computed lifecycle state for a node based on its temporal snapshot.
   */
  static computeLifecycle(snapshot: TemporalSnapshot): import('@pronoia/domain').NodeLifecycleState {
    if (snapshot.trend === 'rising' && snapshot.velocity > 0.5) return 'growing';
    if (snapshot.trend === 'rising') return 'core_knowledge';
    if (snapshot.trend === 'stable') return 'stable';
    if (snapshot.trend === 'declining') return 'aging';
    if (snapshot.trend === 'stagnant') return 'dormant';
    return 'stable';
  }
}

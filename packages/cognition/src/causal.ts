import type { WorldNode, WorldEdge } from '@pronoia/domain';

export interface CausalStep {
  nodeId: string;
  nodeName: string;
  probability: number;          // P(this step | previous step)
  cumulativeProbability: number; // Product of all probabilities up to this step
  timeDelayDays: number;
  cumulativeTimeDelayDays: number;
  evidenceCount: number;
  reversibility: 'reversible' | 'irreversible' | 'partially_reversible';
}

export interface CausalChain {
  sourceNodeId: string;
  targetNodeId: string;
  steps: CausalStep[];
  overallProbability: number;    // Product of all step probabilities
  overallTimeDelayDays: number;  // Sum of all delays
  overallEvidenceCount: number;  // Sum of all evidence counts
  isReversible: boolean;         // False if any step is irreversible
  found: boolean;
}

export interface ImpactSimulation {
  actionNodeId: string;
  actionDescription: string;
  reachableGoals: Array<{
    goalNodeId: string;
    goalName: string;
    probability: number;
    pathLength: number;
    expectedDelayDays: number;
    isReversible: boolean;
  }>;
  strongestChain: CausalChain | null;
}

/**
 * CausalReasoner: Models directed cause-effect chains with probability, delay, and reversibility.
 * Answers: "If I invest in X, what is the downstream impact on Y, how long does it take, and is it reversible?"
 */
export class CausalReasoner {
  /**
   * Finds the highest-probability causal path from source to target node.
   * Uses a probabilistic BFS that multiplies edge probabilities and aggregates delays.
   */
  static trace(
    sourceNodeId: string,
    targetNodeId: string,
    nodes: WorldNode[],
    edges: WorldEdge[]
  ): CausalChain {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Causal edges: 'causes' or 'enables_probability'
    const causalEdges = edges.filter(
      e => e.relationshipType === 'causes' || e.relationshipType === 'enables_probability'
    );

    interface QueueEntry {
      nodeId: string;
      steps: CausalStep[];
      cumulativeProb: number;
      cumulativeDelay: number;
      evidenceCount: number;
      isReversible: boolean;
    }

    const queue: QueueEntry[] = [{
      nodeId: sourceNodeId,
      steps: [],
      cumulativeProb: 1.0,
      cumulativeDelay: 0,
      evidenceCount: 0,
      isReversible: true
    }];
    const visited = new Set<string>();
    let bestChain: CausalChain | null = null;

    while (queue.length > 0) {
      queue.sort((a, b) => b.cumulativeProb - a.cumulativeProb);
      const current = queue.shift()!;

      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);

      if (current.nodeId === targetNodeId && current.steps.length > 0) {
        const chain: CausalChain = {
          sourceNodeId,
          targetNodeId,
          steps: current.steps,
          overallProbability: parseFloat(current.cumulativeProb.toFixed(4)),
          overallTimeDelayDays: current.cumulativeDelay,
          overallEvidenceCount: current.evidenceCount,
          isReversible: current.isReversible,
          found: true
        };
        if (!bestChain || chain.overallProbability > bestChain.overallProbability) {
          bestChain = chain;
        }
        continue;
      }

      // Explore outgoing causal edges
      const outgoing = causalEdges.filter(e => e.sourceId === current.nodeId);
      for (const edge of outgoing) {
        if (visited.has(edge.targetId)) continue;

        const meta = edge.causalMetadata;
        const stepProb = meta?.confidence ?? edge.causalProbability ?? edge.weight ?? 0.5;
        const stepDelay = meta?.timeDelayDays ?? 0;
        const stepEvidence = meta?.evidenceCount ?? 1;
        const stepReversible = meta?.reversibility ?? 'reversible';

        const newCumulativeProb = current.cumulativeProb * stepProb;
        const newCumulativeDelay = current.cumulativeDelay + stepDelay;
        const newEvidenceCount = current.evidenceCount + stepEvidence;
        const newIsReversible = current.isReversible && (stepReversible === 'reversible');

        const targetNode = nodeMap.get(edge.targetId);

        queue.push({
          nodeId: edge.targetId,
          steps: [
            ...current.steps,
            {
              nodeId: edge.targetId,
              nodeName: targetNode?.name ?? edge.targetId,
              probability: stepProb,
              cumulativeProbability: parseFloat(newCumulativeProb.toFixed(4)),
              timeDelayDays: stepDelay,
              cumulativeTimeDelayDays: newCumulativeDelay,
              evidenceCount: stepEvidence,
              reversibility: stepReversible
            }
          ],
          cumulativeProb: newCumulativeProb,
          cumulativeDelay: newCumulativeDelay,
          evidenceCount: newEvidenceCount,
          isReversible: newIsReversible
        });
      }
    }

    return bestChain ?? {
      sourceNodeId,
      targetNodeId,
      steps: [],
      overallProbability: 0,
      overallTimeDelayDays: 0,
      overallEvidenceCount: 0,
      isReversible: true,
      found: false
    };
  }

  /**
   * Simulates the downstream impact of taking a specific action node.
   * Finds all reachable goal nodes and their estimated probabilities.
   */
  static simulateImpact(
    actionNodeId: string,
    nodes: WorldNode[],
    edges: WorldEdge[]
  ): ImpactSimulation {
    const actionNode = nodes.find(n => n.id === actionNodeId);
    const goalNodes = nodes.filter(n => n.type === 'goal');

    const reachableGoals: ImpactSimulation['reachableGoals'] = [];
    let strongestChain: CausalChain | null = null;

    for (const goal of goalNodes) {
      const chain = CausalReasoner.trace(actionNodeId, goal.id, nodes, edges);
      if (chain.found) {
        reachableGoals.push({
          goalNodeId: goal.id,
          goalName: goal.name,
          probability: chain.overallProbability,
          pathLength: chain.steps.length,
          expectedDelayDays: chain.overallTimeDelayDays,
          isReversible: chain.isReversible
        });
        if (!strongestChain || chain.overallProbability > strongestChain.overallProbability) {
          strongestChain = chain;
        }
      }
    }

    // Sort by probability descending
    reachableGoals.sort((a, b) => b.probability - a.probability);

    return {
      actionNodeId,
      actionDescription: actionNode?.description ?? actionNode?.name ?? actionNodeId,
      reachableGoals,
      strongestChain
    };
  }
}

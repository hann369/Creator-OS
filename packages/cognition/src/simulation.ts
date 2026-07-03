import type { WorldNode, WorldEdge } from '@pronoia/domain';
import { CausalReasoner } from './causal.js';
import { GoalGraph } from './goal-graph.js';
import { ResourceConstraintEngine } from './resource-constraint.js';

export interface ScenarioOption {
  id: string;
  label: string;               // e.g., "YouTube-first"
  description: string;
  actionNodeIds: string[];     // Which nodes/actions are taken in this scenario
  timeInvestmentDays: number;  // Planned horizon
  effortLevel: 'low' | 'medium' | 'high';
}

export interface GoalProjection {
  goalId: string;
  goalName: string;
  reachProbability: number;    // 0–1 estimated probability of reaching this goal
  estimatedDaysToReach: number;
  primaryCausalPath: string;   // Description of the main contributing chain
}

export interface SimulationResult {
  scenarioId: string;
  scenarioLabel: string;
  projectedOutcome: string;
  goalProjections: GoalProjection[];
  compositeSuccessProbability: number; // Weighted average across all goal projections
  riskScore: number;                   // 0–1 (higher = riskier)
  confidence: number;                  // 0–1 model confidence in this projection
  recommendation: string;
  projectedResourceConsumption: Record<string, number>;
  resourceShortages: string[];
}

/**
 * ScenarioSimulator: Forward projection engine.
 * "What is likely to happen if I take this path, and what resources will it consume?"
 */
export class ScenarioSimulator {
  /**
   * Runs all provided scenario options and returns ranked simulation results.
   */
  static run(
    options: ScenarioOption[],
    nodes: WorldNode[],
    edges: WorldEdge[],
    horizonDays = 90
  ): SimulationResult[] {
    const goalMap = GoalGraph.build(nodes, edges);
    const goalNodes = nodes.filter(n => n.type === 'goal');
    const resourceNodes = nodes.filter(n => n.type === 'resource');

    const results: SimulationResult[] = options.map(scenario => {
      const effortMultiplier: Record<'low' | 'medium' | 'high', number> = {
        low: 0.6, medium: 1.0, high: 1.4
      };
      const effort = effortMultiplier[scenario.effortLevel];

      // 1. Calculate projected resource consumption
      const projectedResourceConsumption: Record<string, number> = {};
      const resourceShortages: string[] = [];

      scenario.actionNodeIds.forEach(actionNodeId => {
        const actionNode = nodes.find(n => n.id === actionNodeId);
        if (!actionNode) return;

        // Sum up required resources from outgoing requires/depends_on edges
        const outgoingResourceEdges = edges.filter(
          e => e.sourceId === actionNodeId && 
               (e.relationshipType === 'requires' || e.relationshipType === 'depends_on')
        );

        outgoingResourceEdges.forEach(edge => {
          const resNode = resourceNodes.find(r => r.id === edge.targetId);
          if (!resNode) return;

          const requiredValue = (edge.weight ?? resNode.metadata?.requiredDefault ?? 10) * effort;
          projectedResourceConsumption[resNode.name] = (projectedResourceConsumption[resNode.name] ?? 0) + requiredValue;
        });
      });

      // Compare consumption against available resources
      resourceNodes.forEach(resNode => {
        const consumed = projectedResourceConsumption[resNode.name] ?? 0;
        const available = resNode.metadata?.available ?? 0;
        if (consumed > available) {
          resourceShortages.push(
            `Ressource "${resNode.name}" droht auszugehen: Benötigt ${consumed.toFixed(1)}, Verfügbar ${available}.`
          );
        }
      });

      // 2. Goal reachability calculations using Causal trace
      const goalProjections: GoalProjection[] = [];
      let totalProbabilityMass = 0;

      for (const goal of goalNodes) {
        let bestProbability = 0;
        let bestChainDescription = 'Kein direkter kausaler Pfad gefunden.';
        let accumulatedDelay = 0;

        for (const actionNodeId of scenario.actionNodeIds) {
          const chain = CausalReasoner.trace(actionNodeId, goal.id, nodes, edges);
          if (chain.found && chain.overallProbability > bestProbability) {
            bestProbability = chain.overallProbability;
            accumulatedDelay = chain.overallTimeDelayDays;
            const stepNames = chain.steps.map(s => s.nodeName).join(' → ');
            bestChainDescription = `${nodes.find(n => n.id === actionNodeId)?.name ?? actionNodeId} → ${stepNames}`;
          }
        }

        // Apply effort and time horizon scaling
        const timeScale = Math.min(scenario.timeInvestmentDays / horizonDays, 1.2);
        const adjustedProbability = Math.min(bestProbability * effort * timeScale, 0.99);

        if (adjustedProbability > 0.05) {
          const goalDepth = goalMap.get(goal.id)?.depth ?? 0;
          const baseEstimatedDays = Math.round(
            (horizonDays * (1 - adjustedProbability)) / (effort * (1 + goalDepth * 0.1))
          );
          // Incorporate accumulated causal delays
          const estimatedDays = Math.max(baseEstimatedDays + accumulatedDelay, 1);

          goalProjections.push({
            goalId: goal.id,
            goalName: goal.name,
            reachProbability: parseFloat(adjustedProbability.toFixed(3)),
            estimatedDaysToReach: estimatedDays,
            primaryCausalPath: bestChainDescription
          });

          totalProbabilityMass += adjustedProbability;
        }
      }

      goalProjections.sort((a, b) => b.reachProbability - a.reachProbability);

      const compositeSuccessProbability = goalProjections.length > 0
        ? parseFloat((totalProbabilityMass / goalProjections.length).toFixed(3))
        : 0;

      // 3. Risk scoring, incorporating resource shortages
      const shortagePenalty = resourceShortages.length * 0.25;
      const baseRiskScore = 1 - (compositeSuccessProbability * effort * 0.7);
      const riskScore = parseFloat(Math.min(baseRiskScore + shortagePenalty, 1.0).toFixed(3));

      const hasCausalData = edges.some(
        e => e.relationshipType === 'causes' || e.relationshipType === 'enables_probability'
      );
      const confidence = hasCausalData
        ? parseFloat((0.6 + compositeSuccessProbability * 0.35).toFixed(3))
        : 0.3;

      let projectedOutcome = goalProjections.length > 0
        ? `Wahrscheinlichste Auswirkung: ${goalProjections[0].goalName} (${(goalProjections[0].reachProbability * 100).toFixed(0)}% Wahrscheinlichkeit in ~${goalProjections[0].estimatedDaysToReach} Tagen).`
        : 'Keine direkten Zielverbindungen über kausale Ketten gefunden.';

      let recommendation = compositeSuccessProbability > 0.6
        ? 'Starkes Szenario — empfohlen.'
        : compositeSuccessProbability > 0.35
          ? 'Moderates Szenario — mit Fokusanpassung optimierbar.'
          : 'Schwaches Szenario — alternative Optionen prüfen.';

      if (resourceShortages.length > 0) {
        recommendation += ' ACHTUNG: Ressourcenengpass droht!';
      }

      return {
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        projectedOutcome,
        goalProjections,
        compositeSuccessProbability,
        riskScore,
        confidence,
        recommendation,
        projectedResourceConsumption,
        resourceShortages
      };
    });

    // Sort by composite success probability descending
    return results.sort((a, b) => b.compositeSuccessProbability - a.compositeSuccessProbability);
  }
}

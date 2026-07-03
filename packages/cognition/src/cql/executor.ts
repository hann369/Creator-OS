import type { WorldNode, WorldEdge } from '@pronoia/domain';
import { TemporalReasoner } from '../temporal.js';
import { CausalReasoner } from '../causal.js';
import { GoalGraph } from '../goal-graph.js';
import type { CQLAst, CQLCondition } from './parser.js';

export type CQLResult =
  | { kind: 'nodes'; items: WorldNode[] }
  | { kind: 'edges'; items: WorldEdge[] }
  | { kind: 'simulation'; summary: string; details: object }
  | { kind: 'error'; message: string };

/**
 * CQL Executor: walks the knowledge graph according to a parsed CQL AST.
 */
export class CQLExecutor {
  static execute(ast: CQLAst, nodes: WorldNode[], edges: WorldEdge[]): CQLResult {
    try {
      switch (ast.type) {
        case 'FIND':        return CQLExecutor.executeFIND(ast, nodes, edges);
        case 'FIND_BETWEEN': return CQLExecutor.executeFINDBETWEEN(ast, nodes, edges);
        case 'SIMULATE':    return CQLExecutor.executeSIMULATE(ast, nodes, edges);
        default:            return { kind: 'error', message: 'Unknown query type.' };
      }
    } catch (err) {
      return { kind: 'error', message: (err as Error).message };
    }
  }

  // ── FIND ──────────────────────────────────────────────────────────────────

  private static executeFIND(ast: CQLAst, nodes: WorldNode[], edges: WorldEdge[]): CQLResult {
    const temporalSnapshots = TemporalReasoner.analyze(nodes, 30);
    const goalMap = GoalGraph.build(nodes, edges);

    let candidates = [...nodes];

    // Entity filter
    const entity = ast.entity?.toLowerCase();
    if (entity && entity !== 'concepts' && entity !== 'all') {
      const typeMap: Record<string, string[]> = {
        goals: ['goal'],
        insights: ['insight'],
        problems: ['problem'],
        solutions: ['solution'],
        concepts: ['concept', 'entity', 'belief', 'principle']
      };
      const matchTypes = typeMap[entity] ?? [entity];
      candidates = candidates.filter(n => matchTypes.includes(n.type));
    }

    // Apply each WHERE condition
    for (const condition of ast.conditions) {
      candidates = candidates.filter(node =>
        CQLExecutor.matchCondition(node, condition, temporalSnapshots, goalMap, nodes, edges)
      );
    }

    return { kind: 'nodes', items: candidates };
  }

  // ── FIND BETWEEN ──────────────────────────────────────────────────────────

  private static executeFINDBETWEEN(ast: CQLAst, nodes: WorldNode[], edges: WorldEdge[]): CQLResult {
    if (!ast.betweenTypes) return { kind: 'error', message: 'BETWEEN requires two types.' };
    const [typeA, typeB] = ast.betweenTypes.map(t => t.toLowerCase());

    // Find edges connecting nodes of typeA to nodes of typeB
    const matchingEdges = edges.filter(edge => {
      const source = nodes.find(n => n.id === edge.sourceId);
      const target = nodes.find(n => n.id === edge.targetId);
      if (!source || !target) return false;

      const sourceMatch = source.type === typeA || ast.entity?.toLowerCase() === typeA;
      const targetMatch = target.type === typeB || ast.entity?.toLowerCase() === typeB;
      return sourceMatch && targetMatch;
    });

    // Apply WHERE conditions on edge properties
    const filtered = matchingEdges.filter(edge => {
      for (const condition of ast.conditions) {
        if (condition.field === 'confidence_delta') {
          const delta = Math.abs(
            edge.confidence.extractionConfidence - edge.confidence.verificationConfidence
          );
          if (!CQLExecutor.compareNumber(delta, condition.operator, Number(condition.value))) return false;
        }
        if (condition.field === 'type' && edge.relationshipType !== condition.value) return false;
      }
      return true;
    });

    return { kind: 'edges', items: filtered };
  }

  // ── SIMULATE ──────────────────────────────────────────────────────────────

  private static executeSIMULATE(ast: CQLAst, nodes: WorldNode[], edges: WorldEdge[]): CQLResult {
    const goalNode = nodes.find(n =>
      n.type === 'goal' &&
      (n.name.toLowerCase().includes(ast.goalName?.toLowerCase() ?? '') ||
       n.id === ast.goalName)
    );

    if (!goalNode) {
      return {
        kind: 'error',
        message: `Kein Zielknoten mit dem Namen "${ast.goalName}" gefunden.`
      };
    }

    // Find all action/concept nodes and trace causal chains to the goal
    const actionNodes = nodes.filter(n => n.type !== 'goal');
    const chains = actionNodes
      .map(n => CausalReasoner.trace(n.id, goalNode.id, nodes, edges))
      .filter(c => c.found)
      .sort((a, b) => b.overallProbability - a.overallProbability);

    const topChain = chains[0];
    const summary = topChain
      ? `Simulation für "${goalNode.name}" unter "${ast.scenarioLabel ?? 'Standard'}": ` +
        `Stärkster kausaler Pfad — Wahrscheinlichkeit ${(topChain.overallProbability * 100).toFixed(1)}% ` +
        `über ${topChain.steps.length} Schritte in ~${ast.horizonDays} Tagen.`
      : `Keine kausalen Pfade zu "${goalNode.name}" gefunden. Kausale Kanten im Graphen ergänzen.`;

    return {
      kind: 'simulation',
      summary,
      details: {
        goalId: goalNode.id,
        goalName: goalNode.name,
        horizonDays: ast.horizonDays,
        scenarioLabel: ast.scenarioLabel,
        causalChains: chains.slice(0, 5).map(c => ({
          from: nodes.find(n => n.id === c.sourceNodeId)?.name ?? c.sourceNodeId,
          probability: c.overallProbability,
          steps: c.steps.map(s => s.nodeName)
        }))
      }
    };
  }

  // ── Condition Matching ────────────────────────────────────────────────────

  private static matchCondition(
    node: WorldNode,
    condition: CQLCondition,
    temporalSnapshots: ReturnType<typeof TemporalReasoner.analyze>,
    goalMap: ReturnType<typeof GoalGraph.build>,
    allNodes: WorldNode[],
    allEdges: WorldEdge[]
  ): boolean {
    const snap = temporalSnapshots.find(s => s.nodeId === node.id);

    if (condition.isFunction) {
      if (condition.field === 'supports') {
        const targetGoal = [...goalMap.values()].find(g =>
          g.name.toLowerCase().includes(String(condition.value).toLowerCase())
        );
        if (!targetGoal) return false;
        return allEdges.some(e =>
          e.sourceId === node.id &&
          (e.relationshipType === 'supports' || e.relationshipType === 'goal_supports') &&
          e.targetId === targetGoal.id
        );
      }
      return false;
    }

    switch (condition.field) {
      case 'trend':
        return snap?.trend === condition.value;

      case 'confidence':
        return CQLExecutor.compareNumber(
          (node.confidence.extractionConfidence + node.confidence.verificationConfidence) / 2,
          condition.operator,
          Number(condition.value)
        );

      case 'lifecycle':
      case 'lifecycleState':
        return node.lifecycleState === condition.value;

      case 'type':
        return node.type === condition.value;

      case 'velocity':
        return snap !== undefined && CQLExecutor.compareNumber(snap.velocity, condition.operator, Number(condition.value));

      case 'inactive_for': {
        const daysSince = node.lastActivityAt
          ? (Date.now() - node.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
          : (Date.now() - node.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
        return CQLExecutor.compareNumber(daysSince, condition.operator, Number(condition.value));
      }

      default:
        // Generic metadata fallback
        if (node.metadata?.[condition.field] !== undefined) {
          return String(node.metadata[condition.field]) === String(condition.value);
        }
        return false;
    }
  }

  private static compareNumber(value: number, operator: string, target: number): boolean {
    switch (operator) {
      case '>':  return value > target;
      case '<':  return value < target;
      case '>=': return value >= target;
      case '<=': return value <= target;
      case '=':
      case '==': return Math.abs(value - target) < 0.001;
      default:   return false;
    }
  }
}

import type { WorldNode, WorldEdge } from '@pronoia/domain';

export interface GoalNode {
  id: string;
  name: string;
  description?: string;
  parentGoalIds: string[];
  childGoalIds: string[];
  contributionWeights: Record<string, number>; // childId → weight it contributes to THIS goal
  totalContribution: number; // Sum of weighted contribution from all children
  depth: number; // Distance from root goal (0 = root)
}

export interface GoalConflict {
  goalAId: string;
  goalAName: string;
  goalBId: string;
  goalBName: string;
  sharedResourceNodeId?: string;
  sharedResourceName?: string;
  type: 'resource_competition' | 'direct_competition' | 'direct_block' | 'duplicate_goal';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface GoalContributionScore {
  opportunityNodeId: string;
  directGoals: Array<{ goalId: string; goalName: string; score: number }>;
  compositeScore: number; // Weighted sum across all reachable goals
}

/**
 * GoalGraph: Builds and queries a directed network of goals and their sub-goals.
 * Replaces flat goal_relevance scalars in the Executive Engine with
 * full graph-based contribution scoring and conflict detection.
 */
export class GoalGraph {
  /**
   * Extracts goal nodes from the world model and builds the goal network.
   */
  static build(nodes: WorldNode[], edges: WorldEdge[]): Map<string, GoalNode> {
    const goalMap = new Map<string, GoalNode>();

    // Initialize all goal nodes
    nodes
      .filter(n => n.type === 'goal')
      .forEach(n => {
        goalMap.set(n.id, {
          id: n.id,
          name: n.name,
          description: n.description,
          parentGoalIds: [],
          childGoalIds: [],
          contributionWeights: {},
          totalContribution: 0,
          depth: 0
        });
      });

    // Wire goal support edges ('goal_supports' and generic 'supports' between goals)
    edges
      .filter(e => e.relationshipType === 'goal_supports' || e.relationshipType === 'supports')
      .forEach(e => {
        const child = goalMap.get(e.sourceId);
        const parent = goalMap.get(e.targetId);
        if (!child || !parent) return;

        child.parentGoalIds.push(e.targetId);
        parent.childGoalIds.push(e.sourceId);
        parent.contributionWeights[e.sourceId] = e.contributionWeight ?? e.weight ?? 0.5;
        parent.totalContribution += (e.contributionWeight ?? e.weight ?? 0.5);
      });

    // Compute depth via BFS from roots (goals with no parents)
    const roots = [...goalMap.values()].filter(g => g.parentGoalIds.length === 0);
    const bfsQueue: Array<{ id: string; depth: number }> = roots.map(r => ({ id: r.id, depth: 0 }));
    const visited = new Set<string>();
    while (bfsQueue.length > 0) {
      const { id, depth } = bfsQueue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = goalMap.get(id)!;
      node.depth = depth;
      node.childGoalIds.forEach(childId => {
        bfsQueue.push({ id: childId, depth: depth + 1 });
      });
    }

    return goalMap;
  }

  /**
   * Computes how much an opportunity node contributes to the goal network.
   * Traverses all 'supports', 'causes', and 'enables_probability' edges reachable from the opportunity.
   */
  static getContributionScore(
    opportunityNodeId: string,
    nodes: WorldNode[],
    edges: WorldEdge[],
    goalMap: Map<string, GoalNode>
  ): GoalContributionScore {
    const visited = new Set<string>([opportunityNodeId]);
    const queue = [opportunityNodeId];
    const directGoals: GoalContributionScore['directGoals'] = [];

    // Walk the graph following 'supports', 'enables_probability', 'causes' edges
    const traversableTypes = new Set(['supports', 'enables_probability', 'causes', 'goal_supports']);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const outgoing = edges.filter(
        e => e.sourceId === current && traversableTypes.has(e.relationshipType)
      );
      for (const edge of outgoing) {
        if (visited.has(edge.targetId)) continue;
        visited.add(edge.targetId);
        queue.push(edge.targetId);

        const targetGoal = goalMap.get(edge.targetId);
        if (targetGoal) {
          // Score inversely proportional to depth (root goals = highest value)
          const depthPenalty = 1 / (1 + targetGoal.depth);
          const edgeWeight = edge.contributionWeight ?? edge.weight ?? 0.5;
          const score = parseFloat((edgeWeight * depthPenalty).toFixed(3));
          directGoals.push({ goalId: targetGoal.id, goalName: targetGoal.name, score });
        }
      }
    }

    const compositeScore = directGoals.length > 0
      ? parseFloat((directGoals.reduce((sum, g) => sum + g.score, 0) / directGoals.length).toFixed(3))
      : 0;

    return { opportunityNodeId, directGoals, compositeScore };
  }

  /**
   * Detects conflicts:
   * 1. Shared resources (resource_competition)
   * 2. Direct goal competing edges (direct_competition)
   * 3. Direct goal blocking edges (direct_block)
   * 4. Duplicate goals (duplicate_goal)
   */
  static detectConflicts(
    nodes: WorldNode[],
    edges: WorldEdge[],
    goalMap: Map<string, GoalNode>
  ): GoalConflict[] {
    const conflicts: GoalConflict[] = [];
    const goalIds = [...goalMap.keys()];

    // 1. Find resource competition
    const resourceDependencies = new Map<string, string[]>(); // resourceId → goalIds that depend on it
    edges
      .filter(e => e.relationshipType === 'requires' || e.relationshipType === 'depends_on')
      .forEach(e => {
        if (!goalIds.includes(e.sourceId)) return;
        const existing = resourceDependencies.get(e.targetId) ?? [];
        existing.push(e.sourceId);
        resourceDependencies.set(e.targetId, existing);
      });

    resourceDependencies.forEach((dependingGoalIds, resourceId) => {
      if (dependingGoalIds.length < 2) return;
      const resourceNode = nodes.find(n => n.id === resourceId);
      if (!resourceNode) return;

      for (let i = 0; i < dependingGoalIds.length; i++) {
        for (let j = i + 1; j < dependingGoalIds.length; j++) {
          const goalA = goalMap.get(dependingGoalIds[i]);
          const goalB = goalMap.get(dependingGoalIds[j]);
          if (!goalA || !goalB) continue;

          const severity = dependingGoalIds.length > 3 ? 'high' : dependingGoalIds.length > 2 ? 'medium' : 'low';
          conflicts.push({
            goalAId: goalA.id,
            goalAName: goalA.name,
            goalBId: goalB.id,
            goalBName: goalB.name,
            sharedResourceNodeId: resourceId,
            sharedResourceName: resourceNode.name,
            type: 'resource_competition',
            severity,
            description: `"${goalA.name}" und "${goalB.name}" konkurrieren um die Ressource "${resourceNode.name}".`
          });
        }
      }
    });

    // 2. Scan for direct competes_with, blocks, and duplicates edges between goals
    edges.forEach(edge => {
      const goalA = goalMap.get(edge.sourceId);
      const goalB = goalMap.get(edge.targetId);
      if (!goalA || !goalB) return;

      if (edge.relationshipType === 'competes_with') {
        conflicts.push({
          goalAId: goalA.id,
          goalAName: goalA.name,
          goalBId: goalB.id,
          goalBName: goalB.name,
          type: 'direct_competition',
          severity: 'medium',
          description: `Ziel "${goalA.name}" steht in direktem Konflikt (competes_with) mit "${goalB.name}".`
        });
      } else if (edge.relationshipType === 'blocks') {
        conflicts.push({
          goalAId: goalA.id,
          goalAName: goalA.name,
          goalBId: goalB.id,
          goalBName: goalB.name,
          type: 'direct_block',
          severity: 'high',
          description: `Ziel "${goalA.name}" blockiert (blocks) die Ausführung von "${goalB.name}".`
        });
      } else if (edge.relationshipType === 'duplicates') {
        conflicts.push({
          goalAId: goalA.id,
          goalAName: goalA.name,
          goalBId: goalB.id,
          goalBName: goalB.name,
          type: 'duplicate_goal',
          severity: 'low',
          description: `Ziel "${goalA.name}" dupliziert (duplicates) Ziel "${goalB.name}". Konsolidierung empfohlen.`
        });
      }
    });

    return conflicts;
  }
}

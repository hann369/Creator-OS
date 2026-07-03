import type { WorldNode, WorldEdge, ConfidenceDecomposition, DecisionMemoryEntry } from '@pronoia/domain';
import { UserBehaviorLearner } from './adaptive.js';
import { GoalGraph } from './goal-graph.js';
import { CausalReasoner } from './causal.js';
import { ResourceConstraintEngine } from './resource-constraint.js';
import { IntentEngine } from './intent-layer.js';
import { ExecutiveMemoryEngine } from './executive-memory.js';

export interface StrategicOpportunityInput {
  id: string;
  type: 'content_gap' | 'evergreen' | 'business_pivot';
  description: string;
  nicheRelevance: number;
  opportunityScore: number;
  metadata?: Record<string, any>;
}

export interface DecisionDimension {
  name: 'Goals' | 'Resources' | 'Energy' | 'Time' | 'Risk' | 'Learning' | 'Opportunity Cost';
  score: number;   // 0–1
  weight: number;  // 0–1, sums to 1.0 across all dimensions
  weighted: number; // score × weight
}

export interface DecisionVector {
  opportunityId: string;
  description: string;
  dimensions: DecisionDimension[];
  compositeUtility: number;    // Weighted sum of all dimensions
  executiveSummary: string;    // Human-readable rationale
  primaryDimension: string;    // The dimension driving the decision most
  confidenceDecomposition?: ConfidenceDecomposition;
}

export interface ExecutiveContext {
  energyLevel: 'low' | 'medium' | 'high';
  availableTimeMinutes: number;
  expectedROI: Record<string, number>;     // opportunityId → ROI score 0–10
  riskFactors: Record<string, number>;     // opportunityId → risk multiplier 0.5–2.0
  deadlinePressure?: Record<string, number>; // opportunityId → urgency 0–1
  workspaceId?: string;
}

export interface PrioritizedAction {
  opportunityId: string;
  actionDescription: string;
  priorityScore: number;
  explanation: string;
  decisionVector?: DecisionVector;
}

/**
 * ExecutiveFunctionEngine (Prefrontal Cortex 2.0):
 *
 * Implements the dynamic utility function:
 *   Decision Utility = f(Goals, Resources, Energy, Time, Risk, Learning, Opportunity Cost)
 *
 * Weights are adjusted dynamically by the active Intent, and candidates are
 * evaluated against resource constraints.
 */
export class ExecutiveFunctionEngine {
  private static readonly DEFAULT_WEIGHTS: Record<string, number> = {
    goals:              0.25,
    resources:          0.20,
    energy:             0.15,
    time:               0.15,
    risk:               0.10,
    learning:           0.10,
    opportunityCost:    0.05
  };

  /**
   * Full multi-objective evaluation. Returns a DecisionVector per opportunity.
   */
  static evaluateMultiObjective(
    opportunities: StrategicOpportunityInput[],
    context: ExecutiveContext,
    nodes: WorldNode[] = [],
    edges: WorldEdge[] = []
  ): DecisionVector[] {
    // 1. Resolve active intent & adjust weights
    const activeIntent = IntentEngine.getActiveIntent(nodes);
    const adjustedWeights = IntentEngine.adjustWeights(activeIntent, this.DEFAULT_WEIGHTS);

    const goalMap = nodes.length > 0 ? GoalGraph.build(nodes, edges) : new Map();

    const energyMap: Record<'low' | 'medium' | 'high', number> = {
      low: 0.35, medium: 0.70, high: 1.0
    };
    const energyScore = energyMap[context.energyLevel];

    return opportunities.map(opp => {
      // ── 1. Goals (Strategic Alignment) ────────────────────────────────────
      let goalsScore = opp.nicheRelevance / 100;
      let goalContribution = { compositeScore: goalsScore, directGoals: [] as any[] };
      if (nodes.length > 0 && goalMap.size > 0) {
        goalContribution = GoalGraph.getContributionScore(opp.id, nodes, edges, goalMap);
        if (goalContribution.compositeScore > 0) {
          goalsScore = Math.min(goalContribution.compositeScore, 1.0);
        }
      }

      // ── 2. Resources (Fulfillment & Constraints) ──────────────────────────
      const constraintCheck = ResourceConstraintEngine.validate(opp.id, nodes, edges);
      const resourcesScore = parseFloat((1.0 - constraintCheck.penalty).toFixed(3));

      // ── 3. Energy ─────────────────────────────────────────────────────────
      const estimatedEffortLevel = opp.type === 'content_gap' ? 0.8 : 0.5; // 0=easy, 1=hard
      const energyScoreFit = energyScore >= estimatedEffortLevel ? 1.0 : energyScore / estimatedEffortLevel;

      // ── 4. Time (Deadline Pressure & Availability) ───────────────────────
      const deadlinePressure = context.deadlinePressure?.[opp.id] ?? 0.4;
      const requiredTime = opp.metadata?.requiredTimeMinutes ?? 60;
      const timeFitted = context.availableTimeMinutes >= requiredTime ? 1.0 : context.availableTimeMinutes / requiredTime;
      const timeScore = parseFloat(((deadlinePressure * 0.6) + (timeFitted * 0.4)).toFixed(3));

      // ── 5. Risk (Inverted Risk Factor) ────────────────────────────────────
      const riskFactor = context.riskFactors[opp.id] ?? 1.0;
      const riskScore = Math.max(0, 1 - (riskFactor - 0.5) / 1.5);

      // ── 6. Learning ───────────────────────────────────────────────────────
      const learningScore = opp.type === 'content_gap' ? 0.8
        : opp.type === 'evergreen' ? 0.5
        : 0.4;

      // ── 7. Opportunity Cost ───────────────────────────────────────────────
      const maxROI = Math.max(...Object.values(context.expectedROI), 1);
      const thisROI = context.expectedROI[opp.id] ?? 5;
      const opportunityCostScore = 1 - (thisROI / maxROI); // High ROI = low opportunity cost

      // ── Apply weights ──────────────────────────────────────────────────────
      const rawDimensions = [
        { name: 'Goals' as const,            score: goalsScore,            weight: adjustedWeights.goals },
        { name: 'Resources' as const,        score: resourcesScore,        weight: adjustedWeights.resources },
        { name: 'Energy' as const,           score: energyScoreFit,        weight: adjustedWeights.energy },
        { name: 'Time' as const,             score: timeScore,             weight: adjustedWeights.time },
        { name: 'Risk' as const,             score: riskScore,             weight: adjustedWeights.risk },
        { name: 'Learning' as const,         score: learningScore,         weight: adjustedWeights.learning },
        { name: 'Opportunity Cost' as const, score: 1 - opportunityCostScore, weight: adjustedWeights.opportunityCost }
      ];

      const dimensions: DecisionDimension[] = rawDimensions.map(d => ({
        ...d,
        score: parseFloat(d.score.toFixed(3)),
        weighted: parseFloat((d.score * d.weight).toFixed(4))
      }));

      const compositeUtility = parseFloat(
        dimensions.reduce((sum, d) => sum + d.weighted, 0).toFixed(4)
      );

      // Primary dimension — biggest weighted contributor
      const primary = [...dimensions].sort((a, b) => b.weighted - a.weighted)[0];

      // ── 8. Confidence Decomposition ───────────────────────────────────────
      // Heuristic mapping to the 6 confidence dimensions
      const opportunityNode = nodes.find(n => n.id === opp.id);
      
      const evidenceConfidence = opportunityNode?.confidence.extractionConfidence ?? 0.8;
      const reasoningConfidence = opportunityNode?.confidence.reasoningConfidence ?? 0.85;
      const trendConfidence = opp.metadata?.trendScore ? Math.min(opp.metadata.trendScore / 10, 1.0) : 0.7;
      
      // Calculate prediction confidence using causal reasoning path to first goal if available
      let predictionConfidence = 0.5;
      if (goalContribution.directGoals.length > 0) {
        const bestGoal = goalContribution.directGoals.sort((a, b) => b.score - a.score)[0];
        const traceResult = CausalReasoner.trace(opp.id, bestGoal.goalId, nodes, edges);
        if (traceResult.found) {
          predictionConfidence = traceResult.overallProbability;
        }
      }
      
      const goalConfidence = goalsScore;
      const executionConfidence = resourcesScore;

      const confidenceDecomposition: ConfidenceDecomposition = {
        evidenceConfidence,
        reasoningConfidence,
        trendConfidence,
        predictionConfidence,
        goalConfidence,
        executionConfidence
      };

      // ── Executive summary ──────────────────────────────────────────────────
      let executiveSummary = `Nutzen: ${(compositeUtility * 100).toFixed(1)}%. `;
      executiveSummary += `Hauptfaktor: ${primary.name} (${(primary.score * 100).toFixed(0)}%). `;
      if (activeIntent) {
        executiveSummary += `Fokus: Intent "${activeIntent.name}". `;
      }
      if (constraintCheck.violations.length > 0) {
        executiveSummary += `Blocker: ${constraintCheck.violations[0]} `;
      }
      if (energyScoreFit < 0.6) {
        executiveSummary += 'Energielevel niedrig für diese Aufgabe. ';
      }

      return {
        opportunityId: opp.id,
        description: opp.description,
        dimensions,
        compositeUtility,
        executiveSummary,
        primaryDimension: primary.name,
        confidenceDecomposition
      };
    });
  }

  /**
   * Prioritize best action and log to decision memory.
   */
  static prioritize(
    opportunities: StrategicOpportunityInput[],
    context: ExecutiveContext,
    nodes: WorldNode[] = [],
    edges: WorldEdge[] = []
  ): PrioritizedAction {
    if (opportunities.length === 0) {
      return {
        opportunityId: 'default',
        actionDescription: 'Workspace im Gleichgewicht. Erfasse neue Gedanken oder Notizen.',
        priorityScore: 1.0,
        explanation: 'Keine aktiven Handlungsschwerpunkte identifiziert.'
      };
    }

    const vectors = ExecutiveFunctionEngine.evaluateMultiObjective(
      opportunities, context, nodes, edges
    );
    
    // Sort by composite utility descending
    const sorted = [...vectors].sort((a, b) => b.compositeUtility - a.compositeUtility);
    const best = sorted[0];
    const opp = opportunities.find(o => o.id === best.opportunityId)!;

    // Record chosen action and context to Executive Memory
    const activeGoals = nodes.filter(n => n.type === 'goal').map(n => n.id);
    const activeIntent = IntentEngine.getActiveIntent(nodes);
    const activeIntents = activeIntent ? [activeIntent.id] : [];
    const resourceAvailability: Record<string, any> = {};
    nodes.filter(n => n.type === 'resource').forEach(r => {
      resourceAvailability[r.name] = r.metadata?.available ?? 0;
    });

    const workspaceId = context.workspaceId ?? 'default-workspace';

    const memoryEntry: DecisionMemoryEntry = {
      id: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      workspaceId: workspaceId,
      opportunityId: best.opportunityId,
      opportunityDescription: opp.description,
      timestamp: new Date(),
      decisionVector: best,
      contextSnapshot: {
        energyLevel: context.energyLevel,
        availableTimeMinutes: context.availableTimeMinutes,
        activeGoals,
        activeIntents,
        resourceAvailability
      },
      selected: true,
      loggedAt: new Date()
    };

    // Save asynchronously to memory engine
    ExecutiveMemoryEngine.recordDecision(memoryEntry);

    // Record other alternatives as unselected
    sorted.slice(1).forEach(alt => {
      const altOpp = opportunities.find(o => o.id === alt.opportunityId)!;
      ExecutiveMemoryEngine.recordDecision({
        ...memoryEntry,
        id: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        opportunityId: alt.opportunityId,
        opportunityDescription: altOpp.description,
        decisionVector: alt,
        selected: false
      });
    });

    return {
      opportunityId: best.opportunityId,
      actionDescription: opp.description,
      priorityScore: parseFloat((best.compositeUtility * 10).toFixed(2)),
      explanation: best.executiveSummary,
      decisionVector: best
    };
  }
}

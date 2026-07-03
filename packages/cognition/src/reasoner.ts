import { WorldNode, WorldEdge, ConfidenceMatrix } from '@pronoia/domain';

export interface ReasoningResult {
  observation: string;
  hypothesis: string;
  evidence: string;
  conclusion: string;
  recommendation: string;
}

export class ReasoningEvaluator {
  // Evaluate the local graph context and construct structured reasoning chains
  static evaluate(
    nodes: WorldNode[],
    edges: WorldEdge[]
  ): { result: ReasoningResult; confidence: ConfidenceMatrix } {
    console.log(`[Reasoner] Running cognition reasoning cycle on ${nodes.length} nodes`);

    const goalsCount = nodes.filter((n) => n.type === 'goal').length;
    const problemsCount = nodes.filter((n) => n.type === 'problem').length;
    const conceptCount = nodes.filter((n) => n.type === 'concept').length;

    const observation = `Found ${conceptCount} active concepts, ${goalsCount} project goals, and ${problemsCount} blocker problems within the World Model.`;

    let hypothesis = 'Your workspace focus is evenly balanced across research and action items.';
    if (goalsCount > problemsCount) {
      hypothesis = 'You are actively working towards established goals. Focus is shifting towards implementation tasks.';
    } else if (problemsCount > goalsCount) {
      hypothesis = 'Project blockers are accumulating. Workflow bottlenecks are likely limiting project progress.';
    }

    const averageEdgeWeight = edges.length > 0 
      ? edges.reduce((sum, e) => sum + e.weight, 0) / edges.length 
      : 0;
    const evidence = `Semantic link density: ${edges.length} connections. Average link weight: ${averageEdgeWeight.toFixed(2)}. Extraction confidence: 0.90.`;

    let conclusion = 'The active project parameters are aligned with your overall workspace goals.';
    if (problemsCount > goalsCount) {
      conclusion = 'Identified blocker problems are obstructing active project completion milestones.';
    }

    let recommendation = 'No action required. Keep building your active ideas.';
    if (problemsCount > goalsCount) {
      recommendation = 'Create a solution node addressing your top blocker to restore workflow velocity.';
    } else if (conceptCount > 0) {
      recommendation = 'Expand your top concept node into a multi-format content package or script.';
    }

    const confidence: ConfidenceMatrix = {
      extractionConfidence: 0.90,
      reasoningConfidence: 0.85,
      relationshipConfidence: 0.80,
      verificationConfidence: 0.0
    };

    return {
      result: {
        observation,
        hypothesis,
        evidence,
        conclusion,
        recommendation
      },
      confidence
    };
  }
}

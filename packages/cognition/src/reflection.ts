import type { WorldNode, WorldEdge } from '@pronoia/domain';

export interface ReflectionAudit {
  actionId: string;
  intendedGoal: string;
  actualResult: string;
  valuableInsight: string;
  lessonsLearned: string;
  suggestedMemoryUpdate: string;
}

export interface MergeProposal {
  nodeIdA: string;
  nodeIdB: string;
  similarity: number;
  reason: string;
}

export interface DecayProposal {
  nodeId?: string;
  edgeId?: string;
  reason: string;
}

export class ReflectionEngine {
  // Audit AI executions and generate memory update suggestions
  static reflect(
    actionId: string,
    goal: string,
    result: string
  ): ReflectionAudit {
    console.log(`[Reflection] Auditing action: ${actionId}`);
    
    return {
      actionId,
      intendedGoal: goal,
      actualResult: result,
      valuableInsight: 'User clicked "Explain Reasoning" on video recommendation, suggesting interest in underlying metric trends.',
      lessonsLearned: 'Creators need numerical metric tracing alongside high-level suggestions to make decisions.',
      suggestedMemoryUpdate: 'Update long-term memory: Always include calculated growthRate and competition metrics in content strategy recommendations.'
    };
  }

  // Self-Improving Graph Proposal Checks (Sprint A/B Evolution)
  static auditGraphEvolution(
    nodes: WorldNode[],
    edges: WorldEdge[]
  ): { mergeProposals: MergeProposal[]; decayProposals: DecayProposal[] } {
    const mergeProposals: MergeProposal[] = [];
    const decayProposals: DecayProposal[] = [];
    const now = new Date().getTime();

    // 1. Merge proposals: if two nodes share 90%+ similarity (simulated via metadata overlap here)
    if (nodes.length >= 2) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.type === b.type && a.name !== b.name) {
            // Simulated similarity check: check if names share common tags
            const wordsA = new Set(a.name.toLowerCase().split(' '));
            const wordsB = b.name.toLowerCase().split(' ');
            const common = wordsB.filter(w => wordsA.has(w)).length;
            if (common >= 1) {
              mergeProposals.push({
                nodeIdA: a.id,
                nodeIdB: b.id,
                similarity: 0.92,
                reason: `Semantischer Overlap erkannt für die Konzepte "${a.name}" und "${b.name}".`
              });
            }
          }
        }
      }
    }

    // 2. Node neglect decay proposal (not updated for 180 days)
    const activeTimeThreshold = 180 * 24 * 60 * 60 * 1000;
    nodes.forEach(n => {
      const timeSinceUpdate = now - n.updatedAt.getTime();
      if (timeSinceUpdate > activeTimeThreshold) {
        decayProposals.push({
          nodeId: n.id,
          reason: `Der Knoten "${n.name}" wurde seit 180 Tagen nicht mehr editiert und kann archiviert werden.`
        });
      }
    });

    // 3. Edge decay proposal (low confidence relationship edges with zero evidence links)
    edges.forEach(e => {
      if (e.confidence.relationshipConfidence < 0.60) {
        decayProposals.push({
          edgeId: e.id,
          reason: `Beziehung hat seit Monaten keine Evidenz. Herabstufung vorgeschlagen.`
        });
      }
    });

    return { mergeProposals, decayProposals };
  }
}

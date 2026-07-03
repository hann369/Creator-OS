import { DecisionMemoryEntry } from '@pronoia/domain';
import { UserBehaviorLearner } from './adaptive.js';

export class ExecutiveMemoryEngine {
  private static memoryStore: DecisionMemoryEntry[] = [];

  /**
   * Records a new executive decision in memory.
   */
  static async recordDecision(entry: DecisionMemoryEntry): Promise<void> {
    this.memoryStore.push(entry);
    console.log(`[ExecutiveMemory] Logged decision for: "${entry.opportunityDescription}" (ID: ${entry.opportunityId})`);
  }

  /**
   * Retrieves all logged decisions for a workspace.
   */
  static listDecisions(workspaceId: string): DecisionMemoryEntry[] {
    return this.memoryStore.filter(entry => entry.workspaceId === workspaceId);
  }

  /**
   * Logs the actual outcome of a previously made decision.
   * Feeds success scores back into the UserBehaviorLearner to adjust decision weights.
   */
  static async logOutcome(
    decisionId: string,
    outcome: string,
    successScore: number
  ): Promise<void> {
    const entry = this.memoryStore.find(e => e.id === decisionId);
    if (!entry) {
      console.warn(`[ExecutiveMemory] Decision entry not found for ID: ${decisionId}`);
      return;
    }

    entry.actualOutcome = outcome;
    entry.outcomeSuccessScore = successScore;

    console.log(`[ExecutiveMemory] Logged outcome success score of ${successScore} for decision ID ${decisionId}`);

    // Adjust learning weights dynamically based on outcome performance
    // If a decision succeeded, reinforce the primary dimension driving it.
    // If it failed, decrease the weight of the primary dimension driving it.
    const primaryFactor = entry.decisionVector?.primaryDimension?.toLowerCase();
    if (primaryFactor) {
      const modifier = successScore >= 0.7 ? 0.05 : -0.05;
      UserBehaviorLearner.tweakWeight('strategy', primaryFactor, modifier);
      console.log(`[ExecutiveMemory] Reinforcement learning triggered: tweaked strategic weight for "${primaryFactor}" by ${modifier}`);
    }
  }

  /**
   * Clears memory store (mainly for unit tests).
   */
  static clear(): void {
    this.memoryStore = [];
  }
}

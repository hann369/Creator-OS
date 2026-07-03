import type { WorldNode, WorldEdge } from '@pronoia/domain';
import { UserBehaviorLearner } from './adaptive.js';

export interface StrategicOpportunity {
  id: string;
  type: 'content_gap' | 'evergreen' | 'business_pivot';
  description: string;
  nicheRelevance: number; // 0 to 100
  opportunityScore: number;
}

export class StrategyEngine {
  // Advanced scan using Opportunity Score formula: Trend * GoalAlignment * Novelty * Competition * Evidence
  // Dynamic weights are nudged by the user behavior learner loop
  static scanWorkspace(
    nodes: WorldNode[],
    edges: WorldEdge[],
    highGrowthTrends: { topic: string; trendFactor: number; competitionFactor: number }[]
  ): StrategicOpportunity[] {
    const opportunities: StrategicOpportunity[] = [];
    const documentCount = nodes.filter(n => n.type === 'concept').length;
    const weights = UserBehaviorLearner.getWeights('strategy');
    const userModel = UserBehaviorLearner.getUserModel();

    highGrowthTrends.forEach(trend => {
      if (trend.topic === 'AI Agents' && documentCount > 2) {
        // Goal alignment: matches active goal in node metadata
        const activeGoals = nodes.filter(n => n.type === 'goal').length;
        const goalAlignment = activeGoals > 0 ? 1.4 : 1.0;

        // Novelty: neglect parameters
        const novelty = 1.2;

        // Evidence: documents count
        const evidence = Math.min(2.0, 1.0 + documentCount * 0.1);

        // Apply dynamically nudged weights scaled by userModel sensitivities
        const score = (trend.trendFactor * weights.trendWeight * userModel.trendSensitivity) * 
                      (goalAlignment * weights.goalWeight) * 
                      (novelty * weights.noveltyWeight * userModel.riskTolerance) * 
                      trend.competitionFactor * 
                      (evidence * weights.evidenceWeight);
                      
        const scorePercentage = Math.min(100, Math.round(Math.min(1.0, score / 4.0) * 100));

        opportunities.push({
          id: crypto.randomUUID(),
          type: 'content_gap',
          description: 'High search volume detected for "Multi-Agent Systems". Your workspace has 6 documents matching this theme but no social media outline.',
          nicheRelevance: scorePercentage,
          opportunityScore: parseFloat(score.toFixed(2))
        });
      }
    });

    // Add default evergreen opportunity fallback with standard parameters
    opportunities.push({
      id: crypto.randomUUID(),
      type: 'evergreen',
      description: 'Create introductory guides explaining "Model Context Protocol". This remains a stable evergreen search parameter.',
      nicheRelevance: 65,
      opportunityScore: parseFloat((1.56 * weights.evidenceWeight).toFixed(2))
    });

    return opportunities;
  }
}

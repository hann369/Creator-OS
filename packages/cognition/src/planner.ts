export interface Obstacle {
  id: string;
  description: string;
  mitigationStrategy?: string;
  resolved: boolean;
}

export interface CognitiveGoal {
  id: string;
  workspaceId: string;
  title: string;
  targetMetric: string;
  currentValue: number;
  targetValue: number;
  obstacles: Obstacle[];
  linkedKnowledgeNodeIds: string[];
}

export class GoalPlanner {
  // Trace target goals and evaluate active obstacles roadblock status
  static evaluateProgress(goals: CognitiveGoal[]): {
    totalGoals: number;
    achievedGoals: number;
    blockedGoals: number;
    recommendations: string[];
  } {
    let achievedGoals = 0;
    let blockedGoals = 0;
    const recommendations: string[] = [];

    for (const goal of goals) {
      if (goal.currentValue >= goal.targetValue) {
        achievedGoals++;
      } else {
        const activeObstacles = goal.obstacles.filter((o) => !o.resolved);
        if (activeObstacles.length > 0) {
          blockedGoals++;
          recommendations.push(
            `Goal "${goal.title}" is blocked by obstacle: "${activeObstacles[0].description}". Mitigation focus recommended.`
          );
        } else {
          recommendations.push(
            `Goal "${goal.title}" is on track. Add relevant research sources to accelerate progress.`
          );
        }
      }
    }

    return {
      totalGoals: goals.length,
      achievedGoals,
      blockedGoals,
      recommendations
    };
  }
}

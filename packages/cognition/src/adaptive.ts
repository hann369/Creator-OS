export type ActionOutcomeStatus = 
  | 'accepted' 
  | 'completed' 
  | 'document_created' 
  | 'content_published' 
  | 'ignored' 
  | 'irrelevant' 
  | 'wrong';

export interface ActionAcceptanceLog {
  recommendationId: string;
  type: 'trend' | 'goal' | 'novelty' | 'evidence';
  context: 'writing' | 'research' | 'strategy';
  expectedConfidence: number; // System's self-assessed confidence
  timestamp: Date;
  status: ActionOutcomeStatus;
}

// Refined: Separates stable traits from temporary short-term focuses
export interface StableUserTraits {
  preferredWorkingStyle: 'researcher' | 'creator' | 'strategist';
  riskAppetite: number;       // 0.0 to 1.5
  preferredFormats: string[]; // e.g. ['outline', 'video_script', 'newsletter']
}

export interface TemporaryUserFocus {
  activeProjectId?: string;
  shortTermKeywords: string[];
  saisonalityFactor: number;
}

export interface UserPreferenceModel {
  explorationVsExecution: number;
  trendSensitivity: number;
  riskTolerance: number;
  preferredInsightTypes: string[];
  stableTraits: StableUserTraits;
  temporaryFocus: TemporaryUserFocus;
}

export interface ScorerWeights {
  trendWeight: number;
  goalWeight: number;
  noveltyWeight: number;
  evidenceWeight: number;
}

// Recommendation Memory Item: Tracks suggestions to prevent repetitive recommendations
export interface RecommendationHistoryItem {
  recommendationId: string;
  suggestedAt: Date;
  status: 'suggested' | 'acted' | 'ignored';
  cooldownUntil: Date;
}

// Uncertainty Engine: Models WHY the system is uncertain
export interface UncertaintyProfile {
  reason: 'evidence_shortage' | 'conflicting_sources' | 'outdated_information' | 'weak_trends' | 'none';
  explanation: string;
  discrepancyScore: number;
}

// Counterfactual Evaluation: Simulated comparison of chosen vs alternative recommendations
export interface CounterfactualSimulation {
  chosenId: string;
  alternativeId: string;
  hypotheticalDeltaScore: number;
  lessonLearned: string;
}

export interface MetaCognitionAudit {
  totalRecommendations: number;
  averageCalibrationDiscrepancy: number; 
  confidenceBiasCorrection: number;      
  counterfactuals: CounterfactualSimulation[];
}

export class UserBehaviorLearner {
  private static logs: ActionAcceptanceLog[] = [];
  private static recommendationHistory: RecommendationHistoryItem[] = [];
  
  // Dynamic weights separated by context
  private static contextWeights: Record<'writing' | 'research' | 'strategy', ScorerWeights> = {
    writing: { trendWeight: 1.0, goalWeight: 1.2, noveltyWeight: 1.3, evidenceWeight: 1.0 },
    research: { trendWeight: 0.8, goalWeight: 1.0, noveltyWeight: 1.0, evidenceWeight: 1.5 },
    strategy: { trendWeight: 1.2, goalWeight: 1.5, noveltyWeight: 1.0, evidenceWeight: 1.1 }
  };

  private static userModel: UserPreferenceModel = {
    explorationVsExecution: 0.5,
    trendSensitivity: 1.0,
    riskTolerance: 1.0,
    preferredInsightTypes: ['content_gap', 'evergreen'],
    stableTraits: {
      preferredWorkingStyle: 'creator',
      riskAppetite: 1.0,
      preferredFormats: ['outline', 'video_script']
    },
    temporaryFocus: {
      shortTermKeywords: ['ai-agents', 'mcp'],
      saisonalityFactor: 1.0
    }
  };

  private static metaCognition: MetaCognitionAudit = {
    totalRecommendations: 12,
    averageCalibrationDiscrepancy: 0.08,
    confidenceBiasCorrection: 0.95,
    counterfactuals: [
      {
        chosenId: 'rec-1',
        alternativeId: 'rec-2',
        hypotheticalDeltaScore: 1.50,
        lessonLearned: 'Die getroffene Wahl war um 1.5 Punkte erfolgreicher als die Alternative (MCP Tutorial).'
      }
    ]
  };

  private static readonly LEARNING_RATE = 0.02;

  private static readonly REWARD_MATRIX: Record<ActionOutcomeStatus, number> = {
    accepted: 1.0,
    completed: 2.5,
    document_created: 4.0,
    content_published: 8.0,
    ignored: 0.0,
    irrelevant: -2.0,
    wrong: -5.0
  };

  // Log a recommendation to memory and calculate cooldowns
  static trackRecommendation(recommendationId: string): void {
    const cooldownPeriod = 30 * 60 * 1000; // 30 minutes cooldown
    this.recommendationHistory.push({
      recommendationId,
      suggestedAt: new Date(),
      status: 'suggested',
      cooldownUntil: new Date(Date.now() + cooldownPeriod)
    });
  }

  static isRecommendationOnCooldown(recommendationId: string): boolean {
    const record = this.recommendationHistory.find(h => h.recommendationId === recommendationId);
    if (!record) return false;
    return new Date() < record.cooldownUntil;
  }

  static logAction(log: ActionAcceptanceLog, alternativeId?: string): void {
    this.logs.push(log);
    
    // Update recommendation history item state
    const historyItem = this.recommendationHistory.find(h => h.recommendationId === log.recommendationId);
    if (historyItem) {
      historyItem.status = log.status === 'ignored' ? 'ignored' : 'acted';
    }

    this.recalculateWeightsAndPreferences(log);
    this.runMetaCognitionAudit(log.recommendationId, alternativeId);
  }

  static getWeights(context: 'writing' | 'research' | 'strategy' = 'strategy'): ScorerWeights {
    return this.contextWeights[context];
  }

  static getUserModel(): UserPreferenceModel {
    return this.userModel;
  }

  static getMetaCognition(): MetaCognitionAudit {
    return this.metaCognition;
  }

  static tweakWeight(context: 'writing' | 'research' | 'strategy', dimension: string, delta: number): void {
    const weights = this.contextWeights[context] as any;
    const keyMap: Record<string, string> = {
      goals: 'goalWeight',
      resources: 'evidenceWeight',
      risk: 'noveltyWeight',
      time: 'trendWeight',
      learning: 'noveltyWeight',
      energy: 'trendWeight'
    };
    const key = keyMap[dimension] || dimension;
    if (weights && weights[key] !== undefined) {
      weights[key] = Math.max(0.1, weights[key] + delta);
    }
  }

  // Uncertainty Engine: Diagnoses WHY confidence is low
  static diagnoseUncertainty(
    evidenceCount: number,
    hasContradictions: boolean,
    averageAgeDays: number,
    trendScore: number
  ): UncertaintyProfile {
    if (hasContradictions) {
      return {
        reason: 'conflicting_sources',
        explanation: 'Es existieren widersprüchliche Aussagen oder Argumente im Wissensgraphen.',
        discrepancyScore: 0.4
      };
    }
    if (evidenceCount < 2) {
      return {
        reason: 'evidence_shortage',
        explanation: 'Zu wenige Evidenzdokumente vorhanden, um die These verlässlich zu stützen.',
        discrepancyScore: 0.3
      };
    }
    if (averageAgeDays > 60) {
      return {
        reason: 'outdated_information',
        explanation: 'Die zugrundeliegenden Informationen wurden seit über 60 Tagen nicht aktualisiert.',
        discrepancyScore: 0.2
      };
    }
    if (trendScore < 0.5) {
      return {
        reason: 'weak_trends',
        explanation: 'Keine signifikanten Markttrends oder Suchinteressen für dieses Thema messbar.',
        discrepancyScore: 0.1
      };
    }
    return {
      reason: 'none',
      explanation: 'Informationen sind konsistent und gut belegt.',
      discrepancyScore: 0.0
    };
  }

  private static recalculateWeightsAndPreferences(latestLog: ActionAcceptanceLog): void {
    const reward = this.REWARD_MATRIX[latestLog.status];
    const ctx = latestLog.context;
    const currentWeights = this.contextWeights[ctx];
    const delta = reward * this.LEARNING_RATE;

    if (latestLog.type === 'trend') {
      currentWeights.trendWeight = Math.max(0.2, currentWeights.trendWeight + delta);
      this.userModel.trendSensitivity = Math.max(0.1, this.userModel.trendSensitivity + delta * 0.5);
    } else if (latestLog.type === 'goal') {
      currentWeights.goalWeight = Math.max(0.2, currentWeights.goalWeight + delta);
    } else if (latestLog.type === 'novelty') {
      currentWeights.noveltyWeight = Math.max(0.2, currentWeights.noveltyWeight + delta);
      this.userModel.riskTolerance = Math.min(1.5, Math.max(0.1, this.userModel.riskTolerance + delta * 0.1));
    } else if (latestLog.type === 'evidence') {
      currentWeights.evidenceWeight = Math.max(0.2, currentWeights.evidenceWeight + delta);
    }
  }

  private static runMetaCognitionAudit(chosenId: string, alternativeId?: string): void {
    const total = this.logs.length;
    if (total === 0) return;

    let totalDiscrepancy = 0;
    this.logs.forEach(log => {
      const normalizedOutcome = Math.min(1.0, Math.max(0.0, this.REWARD_MATRIX[log.status] / 8.0));
      const discrepancy = log.expectedConfidence - normalizedOutcome;
      totalDiscrepancy += Math.abs(discrepancy);
    });

    const averageCalibrationDiscrepancy = parseFloat((totalDiscrepancy / total).toFixed(2));
    const overconfidenceRatio = this.logs.filter(
      l => l.expectedConfidence > Math.min(1.0, Math.max(0.0, this.REWARD_MATRIX[l.status] / 8.0))
    ).length / total;

    const confidenceBiasCorrection = parseFloat((1.0 - (overconfidenceRatio * 0.2)).toFixed(2));

    // Counterfactual Simulation: Compare chosen vs alternative
    const counterfactuals = [...this.metaCognition.counterfactuals];
    if (alternativeId) {
      const chosenLog = this.logs.find(l => l.recommendationId === chosenId);
      const chosenReward = chosenLog ? this.REWARD_MATRIX[chosenLog.status] : 1.0;
      
      // Simulate hypothetical outcome reward for alternative (assuming default baseline 2.5)
      const simulatedAltReward = 2.5; 
      const delta = chosenReward - simulatedAltReward;

      counterfactuals.push({
        chosenId,
        alternativeId,
        hypotheticalDeltaScore: parseFloat(delta.toFixed(2)),
        lessonLearned: delta >= 0 
          ? `Die getroffene Wahl war um ${delta.toFixed(1)} Punkte erfolgreicher als die Alternative.`
          : `Die nicht gewählte Alternative hätte voraussichtlich einen besseren Outcome geliefert.`
      });

      // Keep counterfactual history capped to last 5 simulations
      if (counterfactuals.length > 5) {
        counterfactuals.shift();
      }
    }

    this.metaCognition = {
      totalRecommendations: total,
      averageCalibrationDiscrepancy,
      confidenceBiasCorrection,
      counterfactuals
    };
  }
}

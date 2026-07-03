import type { WorldNode } from '@pronoia/domain';

export type IntentType = 'authority' | 'quick_growth' | 'education' | 'entertainment' | 'default';

export class IntentEngine {
  /**
   * Identifies the active intent node in the graph.
   * If multiple are marked active, it picks the highest priority or most recently updated.
   */
  static getActiveIntent(nodes: WorldNode[]): WorldNode | null {
    const intents = nodes.filter(n => n.type === 'intent');
    const active = intents.filter(n => n.metadata?.active === true);
    
    if (active.length > 0) {
      // Return most recently updated active intent
      return active.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    }
    
    if (intents.length > 0) {
      // Fallback to first available intent
      return intents[0];
    }
    
    return null;
  }

  /**
   * Dynamically scales baseline decision weights based on the active intent.
   * Ensures weights always sum to exactly 1.0.
   */
  static adjustWeights(
    intentNode: WorldNode | null,
    defaultWeights: Record<string, number>
  ): Record<string, number> {
    if (!intentNode) {
      return { ...defaultWeights };
    }

    const intentType: IntentType = intentNode.metadata?.focusType ?? 'default';
    const adjusted: Record<string, number> = { ...defaultWeights };

    switch (intentType) {
      case 'authority':
        // Focus on long-term reputation and deep learning; deprioritize short-term metrics
        adjusted.utility = 0.05;              // direct views/metrics are minimized
        adjusted.strategicAlignment = 0.25;
        adjusted.longTermValue = 0.30;        // high focus on compounding value
        adjusted.learningValue = 0.20;        // high focus on deep research/learning
        adjusted.opportunityCost = 0.10;
        adjusted.energyFit = 0.05;
        adjusted.deadlinePressure = 0.03;
        adjusted.risk = 0.02;                 // low risk tolerance
        break;

      case 'quick_growth':
        // Focus on viral reach, deadlines, and direct utility; deprioritize long-term research
        adjusted.utility = 0.35;              // high direct view optimization
        adjusted.strategicAlignment = 0.15;
        adjusted.longTermValue = 0.05;        // low focus on evergreen content
        adjusted.learningValue = 0.05;
        adjusted.opportunityCost = 0.10;
        adjusted.energyFit = 0.10;
        adjusted.deadlinePressure = 0.15;     // prioritize immediate uploads
        adjusted.risk = 0.05;
        break;

      case 'education':
        // Focus on learning value, strategic clarity
        adjusted.utility = 0.10;
        adjusted.strategicAlignment = 0.25;
        adjusted.longTermValue = 0.20;
        adjusted.learningValue = 0.30;        // high focus on learning/educational impact
        adjusted.opportunityCost = 0.05;
        adjusted.energyFit = 0.05;
        adjusted.deadlinePressure = 0.03;
        adjusted.risk = 0.02;
        break;

      case 'entertainment':
        // High focus on direct metrics, energy fit, and low friction
        adjusted.utility = 0.30;
        adjusted.strategicAlignment = 0.10;
        adjusted.longTermValue = 0.10;
        adjusted.learningValue = 0.05;
        adjusted.opportunityCost = 0.10;
        adjusted.energyFit = 0.20;            // match current vibe/energy
        adjusted.deadlinePressure = 0.10;
        adjusted.risk = 0.05;
        break;

      default:
        return { ...defaultWeights };
    }

    // Normalize weights to sum exactly to 1.0
    const sum = Object.values(adjusted).reduce((s, w) => s + w, 0);
    const normalized: Record<string, number> = {};
    for (const key of Object.keys(adjusted)) {
      normalized[key] = parseFloat((adjusted[key] / sum).toFixed(4));
    }

    return normalized;
  }
}

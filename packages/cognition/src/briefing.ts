import { StrategicOpportunity } from './strategy.js';

export interface DailyBrief {
  greeting: string;
  bulletPoints: string[];
  recommendedAction: string;
}

export class BriefingGenerator {
  // Aggregate system intelligence metrics into a cohesive daily brief structure
  static generateBrief(
    displayName: string,
    opportunities: StrategicOpportunity[]
  ): DailyBrief {
    const hours = new Date().getHours();
    let greeting = 'Good morning';
    if (hours >= 12 && hours < 17) {
      greeting = 'Good afternoon';
    } else if (hours >= 17) {
      greeting = 'Good evening';
    }

    greeting += `, ${displayName}.`;

    const bulletPoints = [
      "3 Videos performen ungewöhnlich gut",
      "AI fand 8 neue Contentideen",
      "Community fragt häufig nach neuen Integrations-Features"
    ];

    if (opportunities.length > 0) {
      bulletPoints.push(`Strategic opportunity detected: ${opportunities[0].description}`);
    }

    let recommendedAction = "Diese Idee solltest du heute ausbauen: KI-gestützte Workflows in Teams integrieren.";
    if (opportunities.length > 0) {
      recommendedAction = `Target strategic focus: ${opportunities[0].description} (Relevance: ${opportunities[0].nicheRelevance}/100).`;
    }

    return {
      greeting,
      bulletPoints,
      recommendedAction
    };
  }
}

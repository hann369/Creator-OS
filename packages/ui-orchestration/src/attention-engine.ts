import type { RecommendationEvidence } from '@pronoia/domain';

export interface AmbientSuggestion {
  id: string;
  type: 'info' | 'warning' | 'success';
  message: string;
  context: string;
  triggeredAt: Date;
  confidence: number;
  nodeId?: string;
  evidence?: RecommendationEvidence;
}

export interface AttentionPolicy {
  minimumConfidence: number;
  maximumNotificationsPerHour: number;
  minimumTimeBetweenSuggestionsMs: number;
  importanceWeights: Record<string, number>;
}

export class AttentionEngine {
  private suggestions: AmbientSuggestion[] = [];
  private subscribers: ((suggestions: AmbientSuggestion[]) => void)[] = [];
  
  private policy: AttentionPolicy = {
    minimumConfidence: 0.75,
    maximumNotificationsPerHour: 10,
    minimumTimeBetweenSuggestionsMs: 5000,
    importanceWeights: {
      success: 1.2,
      warning: 1.5,
      info: 1.0
    }
  };

  private lastTriggeredAt: Date = new Date(0);

  constructor() {
    // Populate some default ambient context suggestions for the Focus workspace
    this.suggestions = [
      {
        id: '1',
        type: 'info',
        message: 'Diese Idee ergänzt dein Projekt Alpha.',
        context: 'Matches video script structure.',
        triggeredAt: new Date(),
        confidence: 0.88,
        nodeId: 'node_alpha'
      },
      {
        id: '2',
        type: 'success',
        message: 'Dieses Thema wächst aktuell stark (+14.5% volume).',
        context: 'AI Agent trends calculated from Twitter sync.',
        triggeredAt: new Date(),
        confidence: 0.92,
        nodeId: 'node_trends'
      },
      {
        id: '3',
        type: 'warning',
        message: 'Du hast dazu bereits Research-Dokumente.',
        context: 'Found duplicate concepts in "Local LLMs.pdf".',
        triggeredAt: new Date(),
        confidence: 0.81,
        nodeId: 'node_llms'
      }
    ];
  }

  getPolicy(): AttentionPolicy {
    return this.policy;
  }

  updatePolicy(updated: Partial<AttentionPolicy>): void {
    this.policy = { ...this.policy, ...updated };
    console.log(`[AttentionEngine] Attention policy updated:`, this.policy);
  }

  triggerAmbientSuggestion(
    message: string,
    context: string,
    type: AmbientSuggestion['type'] = 'info',
    confidence: number = 0.80,
    nodeId?: string,
    evidence?: RecommendationEvidence
  ): boolean {
    const now = new Date();

    // 1. Minimum Confidence Policy Check
    if (confidence < this.policy.minimumConfidence) {
      console.log(`[AttentionEngine] Suggestion discarded due to low confidence: ${confidence} < ${this.policy.minimumConfidence}`);
      return false;
    }

    // 2. Minimum Time Between Suggestions Policy Check
    const timeSinceLast = now.getTime() - this.lastTriggeredAt.getTime();
    if (timeSinceLast < this.policy.minimumTimeBetweenSuggestionsMs) {
      console.log(`[AttentionEngine] Suggestion throttled. Cooldown active.`);
      return false;
    }

    // 3. Hourly Rate Limit Check
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const notificationsLastHour = this.suggestions.filter(s => s.triggeredAt > oneHourAgo).length;
    if (notificationsLastHour >= this.policy.maximumNotificationsPerHour) {
      console.log(`[AttentionEngine] Suggestion discarded. Maximum hourly notification budget reached.`);
      return false;
    }

    // 4. Deduplication: discard if suggesting for the same Node ID
    if (nodeId && this.suggestions.some(s => s.nodeId === nodeId)) {
      console.log(`[AttentionEngine] Suggestion deduplicated for node: ${nodeId}`);
      return false;
    }

    // 5. Build and score suggestion (Confidence * Importance Weight)
    const weight = this.policy.importanceWeights[type] || 1.0;
    const finalScore = confidence * weight;
    console.log(`[AttentionEngine] Queueing suggestion with final score: ${finalScore.toFixed(2)}`);

    const suggestion: AmbientSuggestion = {
      id: crypto.randomUUID(),
      type,
      message,
      context,
      triggeredAt: now,
      confidence,
      nodeId,
      evidence
    };

    // Insert into sorted position based on confidence score (or simply prepended with sorted ranking)
    this.suggestions.unshift(suggestion);
    this.lastTriggeredAt = now;
    this.notify();
    return true;
  }

  getSuggestions(): AmbientSuggestion[] {
    return this.suggestions;
  }

  dismissSuggestion(id: string): void {
    this.suggestions = this.suggestions.filter((s) => s.id !== id);
    this.notify();
  }

  subscribe(fn: (suggestions: AmbientSuggestion[]) => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== fn);
    };
  }

  private notify(): void {
    this.subscribers.forEach((fn) => fn([...this.suggestions]));
  }
}

export const globalAttentionEngine = new AttentionEngine();

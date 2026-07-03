import { ModelMetadata, ModelCapabilities, ProviderHealth } from './types.js';

export class ProviderHealthMonitor {
  private healthStates = new Map<string, ProviderHealth>();

  constructor() {
    this.initializeDefaults();
  }

  getHealth(providerId: string): ProviderHealth | undefined {
    return this.healthStates.get(providerId);
  }

  reportSuccess(providerId: string, latencyMs: number): void {
    const health = this.healthStates.get(providerId);
    if (health) {
      health.isAvailable = true;
      health.lastChecked = new Date();
      // Smooth decay error rate
      health.errorRate = health.errorRate * 0.8;
      health.averageResponseTimeMs = Math.round(health.averageResponseTimeMs * 0.7 + latencyMs * 0.3);
    }
  }

  reportFailure(providerId: string): void {
    const health = this.healthStates.get(providerId);
    if (health) {
      health.lastChecked = new Date();
      health.errorRate = health.errorRate * 0.8 + 0.2; // Increase error rate
      if (health.errorRate > 0.6) {
        health.isAvailable = false;
      }
    }
  }

  private initializeDefaults(): void {
    const providers = ['mistral', 'hermes', 'pomelli', 'ollama'];
    providers.forEach(p => {
      this.healthStates.set(p, {
        providerId: p,
        isAvailable: true,
        errorRate: 0.0,
        averageResponseTimeMs: 300,
        lastChecked: new Date()
      });
    });
  }
}

export const globalHealthMonitor = new ProviderHealthMonitor();

export class ModelRegistry {
  private models = new Map<string, ModelMetadata>();
  private healthMonitor: ProviderHealthMonitor;

  constructor(healthMonitor: ProviderHealthMonitor = globalHealthMonitor) {
    this.healthMonitor = healthMonitor;
    this.registerDefaults();
  }

  register(model: ModelMetadata): void {
    this.models.set(model.id, model);
  }

  get(id: string): ModelMetadata | undefined {
    return this.models.get(id);
  }

  list(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  // Advanced AI Router (Capability-based Routing Layer)
  route(requirements: {
    maxCostTier?: 'free' | 'low' | 'medium' | 'high';
    minContextLength?: number;
    needsReasoning?: boolean;
    needsEmbeddings?: boolean;
    needsVision?: boolean;
    needsToolCalling?: boolean;
    needsStructuredOutput?: boolean;
    preferredPrivacy?: 'local' | 'private' | 'public';
  }): ModelMetadata {
    const list = this.list();
    
    // 1. Filter out models from unhealthy providers
    let candidates = list.filter(model => {
      const health = this.healthMonitor.getHealth(model.providerId);
      return health ? health.isAvailable : true;
    });

    if (candidates.length === 0) {
      console.warn('[AIRouter] All primary providers unhealthy. Falling back to absolute defaults.');
      candidates = list;
    }

    // 2. Filter by Capabilities
    if (requirements.needsReasoning) {
      candidates = candidates.filter(m => m.capabilities.reasoning);
    }
    if (requirements.needsEmbeddings) {
      candidates = candidates.filter(m => m.capabilities.embeddings);
    }
    if (requirements.needsVision) {
      candidates = candidates.filter(m => m.capabilities.vision);
    }
    if (requirements.needsToolCalling) {
      candidates = candidates.filter(m => m.capabilities.toolCalling);
    }
    if (requirements.needsStructuredOutput) {
      candidates = candidates.filter(m => m.capabilities.structuredOutput);
    }

    // 3. Filter by Context Window Length
    if (requirements.minContextLength !== undefined) {
      const minCtx = requirements.minContextLength;
      candidates = candidates.filter(m => m.capabilities.maxContext >= minCtx);
    }

    if (candidates.length === 0) {
      console.warn('[AIRouter] No models satisfy capabilities criteria. Falling back to default.');
      return list[0]; // Returns default Mistral
    }

    // 4. Sort by Privacy Preference, Cost, and Latency
    candidates.sort((a, b) => {
      // Prioritize local privacy if preferred
      if (requirements.preferredPrivacy) {
        const pref = requirements.preferredPrivacy;
        if (a.capabilities.privacyLevel === pref && b.capabilities.privacyLevel !== pref) return -1;
        if (b.capabilities.privacyLevel === pref && a.capabilities.privacyLevel !== pref) return 1;
      }

      // Cost comparison (low tier first)
      const costMap = { free: 0, low: 1, medium: 2, high: 3 };
      const costDiff = costMap[a.capabilities.costTier] - costMap[b.capabilities.costTier];
      if (costDiff !== 0) return costDiff;

      // Latency comparison
      return a.averageLatencyMs - b.averageLatencyMs;
    });

    return candidates[0];
  }

  private registerDefaults(): void {
    // 1. Mistral Large
    this.register({
      id: 'mistral-large',
      providerId: 'mistral',
      averageLatencyMs: 800,
      costPer1kInput: 0.002,
      costPer1kOutput: 0.006,
      capabilities: {
        chat: true,
        reasoning: true,
        embeddings: false,
        vision: false,
        toolCalling: true,
        structuredOutput: true,
        jsonMode: true,
        streaming: true,
        functionCalling: true,
        maxContext: 128000,
        maxOutput: 4096,
        costTier: 'medium',
        latencyTier: 'medium',
        privacyLevel: 'public'
      }
    });

    // 2. Nous Hermes 2
    this.register({
      id: 'hermes-2',
      providerId: 'hermes',
      averageLatencyMs: 400,
      costPer1kInput: 0.0005,
      costPer1kOutput: 0.0015,
      capabilities: {
        chat: true,
        reasoning: false,
        embeddings: false,
        vision: false,
        toolCalling: true,
        structuredOutput: false,
        jsonMode: true,
        streaming: true,
        functionCalling: true,
        maxContext: 32000,
        maxOutput: 4096,
        costTier: 'low',
        latencyTier: 'low',
        privacyLevel: 'private'
      }
    });

    // 3. Google Pomelli
    this.register({
      id: 'pomelli-v1',
      providerId: 'pomelli',
      averageLatencyMs: 1200,
      costPer1kInput: 0.000075,
      costPer1kOutput: 0.0003,
      capabilities: {
        chat: true,
        reasoning: true,
        embeddings: true,
        vision: true,
        toolCalling: true,
        structuredOutput: true,
        jsonMode: true,
        streaming: true,
        functionCalling: true,
        maxContext: 1048576,
        maxOutput: 8192,
        costTier: 'low',
        latencyTier: 'medium',
        privacyLevel: 'private'
      }
    });

    // 4. Ollama llama3
    this.register({
      id: 'ollama-llama3',
      providerId: 'ollama',
      averageLatencyMs: 150,
      costPer1kInput: 0.0,
      costPer1kOutput: 0.0,
      capabilities: {
        chat: true,
        reasoning: false,
        embeddings: true,
        vision: false,
        toolCalling: false,
        structuredOutput: false,
        jsonMode: true,
        streaming: true,
        functionCalling: false,
        maxContext: 8192,
        maxOutput: 2048,
        costTier: 'free',
        latencyTier: 'low',
        privacyLevel: 'local'
      }
    });
  }
}

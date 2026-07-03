export interface AIStreamChunk {
  text: string;
  done: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type CostTier = 'free' | 'low' | 'medium' | 'high';
export type LatencyTier = 'low' | 'medium' | 'high';
export type PrivacyLevel = 'local' | 'private' | 'public';

// Structured output for reasoning results
export interface ReasoningResult {
  observation: string;
  hypotheses: string[];
  evidence: string[];
  conclusion: string;
  recommendations: string[];
  confidence: number;
}

// Decoupled AI Role Providers
export interface ChatProvider {
  generateChat(messages: ChatMessage[], options?: Record<string, any>): Promise<string>;
  generateChatStream(messages: ChatMessage[], options?: Record<string, any>): AsyncGenerator<AIStreamChunk>;
}

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export interface ReasoningProvider {
  generateReasoning(prompt: string, options?: Record<string, any>): Promise<ReasoningResult>;
}

export interface VisionProvider {
  analyzeImage(imageBuffer: Buffer, prompt: string, options?: Record<string, any>): Promise<string>;
}

// Tool & execution provider for actions (MCP, file system, web search)
export interface ToolProvider {
  executeTool(toolName: string, args: Record<string, any>): Promise<Record<string, any>>;
}

// Base Provider contract
export interface AIProvider {
  id: string;
  name: string;
  initialize(config: Record<string, any>): void;
}

// Model Capabilities Profiling
export interface ModelCapabilities {
  chat: boolean;
  reasoning: boolean;
  embeddings: boolean;
  vision: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  jsonMode: boolean;
  streaming: boolean;
  functionCalling: boolean;
  maxContext: number;
  maxOutput: number;
  costTier: CostTier;
  latencyTier: LatencyTier;
  privacyLevel: PrivacyLevel;
}

export interface ModelMetadata {
  id: string;
  providerId: string;
  averageLatencyMs: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  capabilities: ModelCapabilities;
}

// Provider Health Metrics
export interface ProviderHealth {
  providerId: string;
  isAvailable: boolean;
  errorRate: number; // 0 to 1
  averageResponseTimeMs: number;
  lastChecked: Date;
}

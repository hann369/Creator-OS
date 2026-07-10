// User context & authentication profiles
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
}

// User workspace grouping
export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
}

// Role-based Access Control (RBAC) definitions
export type UserRole = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
  createdAt: Date;
}

// Collaborative document (CRDT backed state binary data)
export interface CollaborativeDocument {
  id: string;
  workspaceId: string;
  title: string;
  stateVector: Uint8Array | null; // CRDT binary state updates
  createdAt: Date;
  updatedAt: Date;
}

// Linear-like Projects structure
export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  goals: string[];
  targetDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// World Model Node Types representation
export type WorldNodeType =
  | 'entity'
  | 'concept'
  | 'person'
  | 'company'
  | 'project'
  | 'goal'
  | 'intent'
  | 'problem'
  | 'solution'
  | 'insight'
  | 'belief'
  | 'question'
  | 'decision'
  | 'task'
  | 'assumption'
  | 'risk'
  | 'opportunity'
  | 'metric'
  | 'constraint'
  | 'resource'
  | 'habit'
  | 'principle';

// Structured Confidence ratings
export interface ConfidenceMatrix {
  extractionConfidence: number;   // Accuracy of model entity parsing (0.0 to 1.0)
  reasoningConfidence: number;    // Contextual sanity index (0.0 to 1.0)
  relationshipConfidence: number; // Node correlation accuracy (0.0 to 1.0)
  verificationConfidence: number; // User audit validation status (0.0 to 1.0)
}

export interface ConfidenceDecomposition {
  evidenceConfidence: number;    // Strength of source documents/research backing the concept (0-1)
  reasoningConfidence: number;   // Internal logical coherence check of the pipeline (0-1)
  trendConfidence: number;       // Reliability of market/platform trend signals (0-1)
  predictionConfidence: number;  // Accuracy of causal propagation / simulation outcomes (0-1)
  goalConfidence: number;        // Alignment accuracy within the Goal Graph (0-1)
  executionConfidence: number;   // Likelihood of successful execution given constraints (0-1)
}

// Living World Model lifecycle states
export type NodeLifecycleState =
  | 'created'        // Just entered the graph
  | 'growing'        // Gaining evidence and connections
  | 'core_knowledge' // High centrality, heavily cited
  | 'stable'         // Mature, low activity but consistent
  | 'aging'          // Inactivity detected, needs attention
  | 'dormant'        // Negligible activity for extended period
  | 'archived';      // Explicitly archived or superseded

// Node Identity: the stable semantic profile of a concept that evolves with evidence
export interface NodeIdentityEntry {
  timestamp: Date;
  coreMeaning: string;
}

export interface NodeIdentity {
  coreMeaning: string;          // Current best-fit definition of this concept
  importanceScore: number;      // Centrality × recency × goal proximity (0–1)
  semanticDrift: number;        // Accumulated meaning change since creation (0–1)
  relationalIdentity: string[]; // IDs of nodes that define this one by association
  evolutionLog: NodeIdentityEntry[]; // Timestamped record of meaning shifts
}

// The World Model representing knowledge as semantic concepts/nodes
export interface WorldNode {
  id: string; // E.g., 'concept:ai-agents' or UUID
  workspaceId: string;
  name: string;
  type: WorldNodeType;
  description?: string;
  metadata: Record<string, any>;
  confidence: ConfidenceMatrix;
  confidenceDecomposition?: ConfidenceDecomposition; // Detailed confidence dimensions (Track 3/5/8)
  sourceCount: number;
  lastVerified: Date;
  derivedFrom: string[]; // Source UUID references (e.g. documents, research, comments)
  lifecycleState: NodeLifecycleState; // Living World Model state
  lastActivityAt?: Date;              // Tracks last meaningful interaction
  velocityScore?: number;             // Rate of change over recent period (0-1)
  identity?: NodeIdentity;            // Semantic identity profile (Track 6)
  createdAt: Date;
  updatedAt: Date;
}

// Edge Relationship Types
export type WorldEdgeType =
  | 'supports'
  | 'contradicts'
  | 'causes'
  | 'depends_on'
  | 'inspired_by'
  | 'derived_from'
  | 'mentions'
  | 'references'
  | 'belongs_to'
  | 'solves'
  | 'blocks'
  | 'requires'
  | 'duplicates'
  | 'extends'
  | 'competes_with'       // Goal graph conflict edge
  | 'enables_probability' // Causal edge: source action probabilistically enables target outcome
  | 'goal_supports';     // Goal hierarchy edge: sub-goal contributes to parent goal

export interface CausalMetadata {
  confidence: number;            // P(causation is true) 0-1
  timeDelayDays: number;         // Time delay before cause triggers effect in days
  evidenceCount: number;         // Number of source evidence counts supporting this causal link
  reversibility: 'reversible' | 'irreversible' | 'partially_reversible';
}

// Directed, weighted edges mapping node relationships in the World Model
export interface WorldEdge {
  id: string;
  workspaceId: string;
  sourceId: string;
  targetId: string;
  weight: number;
  relationshipType: WorldEdgeType;
  confidence: ConfidenceMatrix;
  causalProbability?: number;   // For 'causes'/'enables_probability' edges: P(effect | cause) 0-1
  causalMetadata?: CausalMetadata; // Detailed causal metrics (Track 3)
  contributionWeight?: number;  // For 'goal_supports' edges: how much this sub-goal feeds the parent 0-1
  createdAt: Date;
}

// Configurable vector embeddings metadata structure
export interface EmbeddingMetadata {
  provider: string;   // e.g., 'mistral', 'openai'
  model: string;      // e.g., 'text-embedding-3-small'
  dimension: number;  // e.g., 1536, 1024, 768
  version: string;    // e.g., 'v1.0'
}

// Chunks generated from world nodes (for vector embedding indexing)
export interface WorldNodeChunk {
  id: string;
  nodeId: string;
  content: string;
  embedding?: number[]; // Vector embedding array (dynamic size)
  embeddingMetadata?: EmbeddingMetadata;
  createdAt: Date;
}

// Ingestion structures for raw input sources in the Research pipeline
export type ResearchType = 'pdf' | 'url' | 'video' | 'podcast' | 'tweet';

export interface ResearchEntry {
  id: string;
  workspaceId: string;
  title: string;
  sourceType: ResearchType;
  sourceUrl?: string;
  rawContent?: string;
  summary?: string;
  keyFindings: string[];
  createdAt: Date;
}

// Video / Content performance metrics (tracked post-publish)
export interface ContentMetrics {
  views: number;
  watchTimeMinutes: number;
  avgViewDurationSeconds: number;
  clickThroughRate: number;   // 0–1
  likes: number;
  comments: number;
  shares: number;
  subscriberGain: number;
  viralScore: number;         // Computed: (shares * 3 + comments * 2 + likes) / views — 0 to 10
}

// Content Pipeline mapping ideas to publications
export type PipelineStatus = 'idea' | 'research' | 'outline' | 'script' | 'production' | 'published';
export type ContentFormat = 'longform' | 'short' | 'tutorial' | 'vlog' | 'interview' | 'documentary' | 'thread' | 'newsletter';

export interface ContentPipeline {
  id: string;
  ideaId?: string;
  projectId?: string;
  workspaceId: string;
  title: string;
  hook?: string;               // Opening hook sentence
  format: ContentFormat;
  status: PipelineStatus;
  platforms: string[];         // e.g. ['youtube', 'x', 'instagram']
  trendScore?: number;         // 0–10 based on search trend volume
  executivePriority?: number;  // Injected from ExecutiveFunctionEngine
  linkedNodeIds?: string[];    // World Model node connections
  metrics?: ContentMetrics;    // Populated after publish
  thumbnailUrl?: string;
  scheduledAt?: Date;
  publishedAt?: Date;
  x?: number;
  y?: number;
  createdAt: Date;
  updatedAt: Date;
}


// Idea Entity
export interface Idea {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// AI Message role types
export type ChatRole = 'user' | 'assistant' | 'system';

export interface AISession {
  id: string;
  workspaceId: string;
  projectId?: string;
  agentId: string;
  createdAt: Date;
}

export interface AIMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

// Connected Social Media Accounts
export interface SocialAccount {
  id: string;
  workspaceId: string;
  platform: string; // 'youtube' | 'x' | 'instagram'
  accountName: string;
  credentialsEncrypted: string;
  createdAt: Date;
}

// Social analytics metrics snapshot
export interface AnalyticsSnapshot {
  id: string;
  socialAccountId: string;
  views: number;
  likes: number;
  subscribers: number;
  engagementRate: number;
  recordedAt: Date;
}

// Budgets and Cost Logs
export interface AIUsageLog {
  id: string;
  workspaceId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  calculatedCost: number;
  createdAt: Date;
}

export interface WorkspaceBudget {
  workspaceId: string;
  monthlyLimitUsd: number;
  currentSpendUsd: number;
  updatedAt: Date;
}

// Versioned Agent Configurations
export interface AgentDefinition {
  id: string;
  workspaceId: string;
  name: string;
  version: number;
  systemPrompt: string;
  temperature: number;
  allowedTools: string[];
  createdAt: Date;
}

// Audited work session entity for productivity analytics
export enum CognitiveState {
  DeepFocus = 'DeepFocus',
  Exploration = 'Exploration',
  Planning = 'Planning',
  Reflection = 'Reflection',
  CreativeFlow = 'CreativeFlow',
  Fatigued = 'Fatigued',
  Distracted = 'Distracted'
}

export interface CognitiveSession {
  id: string;
  workspaceId: string;
  startedAt: Date;
  endedAt?: Date;
  state: 'morning' | 'focus' | 'reflect';
  primaryGoalId?: string;
  activeProjectId?: string;
  activeDocumentId?: string;
  triggeredEvents: string[];
  generatedInsights: string[];
  decisions: string[];
  recommendations: string[];
  reflectionId?: string;
  nextSessionGoal?: string;
  expectedOutcome?: string;
  potentialBlockers?: string[];
  cognitiveState?: CognitiveState;
  productivityScore?: number;
}

export interface RecommendationEvidence {
  supportingDocumentIds: string[];
  supportingNodeIds: string[];
  activeTrends: string[];
  overallConfidence: number;
}

export interface ProvenanceNode {
  sourceDocumentId: string;
  sourceTextSnippet: string;
  paragraphOffset: number;
  sentenceIndex: number;
  importTimestamp: Date;
  ingestorType: 'markdown' | 'pdf' | 'url' | 'youtube' | 'folder';
}

export interface ProvenanceTrace {
  importSourceId: string;
  chunkId: string;
  embeddingVectorId: string;
  extractedEntityIds: string[];
  relationshipIds: string[];
  reasoningEvaluationId: string;
  recommendationId: string;
  uiCardId: string;
}

export interface DecisionMemoryEntry {
  id: string;
  workspaceId: string;
  opportunityId: string;
  opportunityDescription: string;
  timestamp: Date;
  decisionVector: any;            // The DecisionVector output at the moment of evaluation
  contextSnapshot: {
    energyLevel: 'low' | 'medium' | 'high';
    availableTimeMinutes: number;
    activeGoals: string[];
    activeIntents: string[];
    resourceAvailability: Record<string, any>;
  };
  selected: boolean;              // True if this was prioritized as the selected action
  actualOutcome?: string;         // Logged outcome once completed/observed
  outcomeSuccessScore?: number;   // Evaluation of outcome (0-1)
  loggedAt: Date;
}


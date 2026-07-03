import { WorldNode, WorldEdge, ConfidenceMatrix } from './models.js';

export interface BaseWorkspaceEvent<T = string, P = any> {
  id: string;
  workspaceId: string;
  userId?: string;
  eventType: T;
  payload: P;
  createdAt: Date;
}

// 1. Document events
export interface DocumentCreatedPayload {
  documentId: string;
  title: string;
  workspaceId: string;
  content?: string;
}
export type DocumentCreatedEvent = BaseWorkspaceEvent<'DocumentCreated', DocumentCreatedPayload>;

export interface DocumentUpdatedPayload {
  documentId: string;
  title?: string;
  stateVectorDelta?: Uint8Array; // CRDT binary delta
}
export type DocumentUpdatedEvent = BaseWorkspaceEvent<'DocumentUpdated', DocumentUpdatedPayload>;

// 2. Idea events
export interface IdeaCreatedPayload {
  ideaId: string;
  title: string;
  content: string;
}
export type IdeaCreatedEvent = BaseWorkspaceEvent<'IdeaCreated', IdeaCreatedPayload>;

export interface IdeaMergedPayload {
  sourceIdeaId: string;
  targetIdeaId: string;
  mergedTitle: string;
  mergedContent: string;
}
export type IdeaMergedEvent = BaseWorkspaceEvent<'IdeaMerged', IdeaMergedPayload>;

// 3. World Model Graph events
export interface WorldNodeCreatedPayload {
  node: WorldNode;
}
export type WorldNodeCreatedEvent = BaseWorkspaceEvent<'WorldNodeCreated', WorldNodeCreatedPayload>;

export interface WorldEdgeCreatedPayload {
  edge: WorldEdge;
}
export type WorldEdgeCreatedEvent = BaseWorkspaceEvent<'WorldEdgeCreated', WorldEdgeCreatedPayload>;

// 4. Insight events
export interface InsightGeneratedPayload {
  insightId: string;
  nodeId: string; // References the newly added or updated insight node in the World Model
  summary: string;
  reasoningTrail: {
    observation: string;
    hypothesis: string;
    evidence: string;
    conclusion: string;
    recommendation: string;
  };
  confidence: ConfidenceMatrix;
}
export type InsightGeneratedEvent = BaseWorkspaceEvent<'InsightGenerated', InsightGeneratedPayload>;

// 5. Agent events
export interface AgentExecutedPayload {
  agentId: string;
  sessionId: string;
  inputPrompt: string;
  outputResponse: string;
  tokensConsumed: number;
}
export type AgentExecutedEvent = BaseWorkspaceEvent<'AgentExecuted', AgentExecutedPayload>;

// 6. MCP events
export interface MCPInstalledPayload {
  mcpId: string;
  name: string;
  endpoint: string;
  scopes: string[];
}
export type MCPInstalledEvent = BaseWorkspaceEvent<'MCPInstalled', MCPInstalledPayload>;

// 7. Research events
export interface ResearchImportedPayload {
  researchId: string;
  sourceType: string;
  sourceUrl?: string;
  title: string;
}
export type ResearchImportedEvent = BaseWorkspaceEvent<'ResearchImported', ResearchImportedPayload>;

// 8. Workflow events
export interface WorkflowCompletedPayload {
  workflowId: string;
  executionId: string;
  status: 'success' | 'failed';
  durationMs: number;
}
export type WorkflowCompletedEvent = BaseWorkspaceEvent<'WorkflowCompleted', WorkflowCompletedPayload>;

// Union type for all workspace event sourcing items
export type WorkspaceEvent =
  | DocumentCreatedEvent
  | DocumentUpdatedEvent
  | IdeaCreatedEvent
  | IdeaMergedEvent
  | WorldNodeCreatedEvent
  | WorldEdgeCreatedEvent
  | InsightGeneratedEvent
  | AgentExecutedEvent
  | MCPInstalledEvent
  | ResearchImportedEvent
  | WorkflowCompletedEvent;

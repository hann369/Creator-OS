import { 
  User, 
  Workspace, 
  CollaborativeDocument, 
  Project, 
  WorldNode, 
  WorldEdge,
  ResearchEntry,
  ContentPipeline,
  Idea
} from '@pronoia/domain';

// Transaction boundary token interface for atomic graph operations
export interface GraphTransaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
}

export interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  listByUserId(userId: string): Promise<Workspace[]>;
  create(workspace: Omit<Workspace, 'id' | 'createdAt'>): Promise<Workspace>;
}

export interface DocumentRepository {
  findById(id: string): Promise<CollaborativeDocument | null>;
  listByWorkspaceId(workspaceId: string): Promise<CollaborativeDocument[]>;
  create(doc: Omit<CollaborativeDocument, 'id' | 'createdAt' | 'updatedAt'>): Promise<CollaborativeDocument>;
  updateStateVector(id: string, stateVector: Uint8Array): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  listByWorkspaceId(workspaceId: string): Promise<Project[]>;
  create(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  update(id: string, updates: Partial<Omit<Project, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>): Promise<Project>;
}

export interface WorldModelRepository {
  findNodeById(id: string): Promise<WorldNode | null>;
  listNodesByWorkspaceId(workspaceId: string): Promise<WorldNode[]>;
  createNode(node: WorldNode): Promise<WorldNode>;
  updateNode(id: string, updates: Partial<Omit<WorldNode, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>): Promise<WorldNode>;
  deleteNode(id: string): Promise<void>;

  createEdge(edge: WorldEdge): Promise<WorldEdge>;
  listEdgesByWorkspaceId(workspaceId: string): Promise<WorldEdge[]>;
  deleteEdge(sourceId: string, targetId: string): Promise<void>;
}

// Decoupled Graph Repository with transaction context injection
export interface GraphRepository {
  beginTransaction(): Promise<GraphTransaction>;

  saveNode(node: WorldNode, tx?: GraphTransaction): Promise<void>;
  findNode(id: string): Promise<WorldNode | null>;
  deleteNode(id: string, tx?: GraphTransaction): Promise<void>;
  listNodes(workspaceId: string, filter?: { type?: WorldNode['type'] }): Promise<WorldNode[]>;

  saveEdge(edge: WorldEdge, tx?: GraphTransaction): Promise<void>;
  findEdge(sourceId: string, targetId: string): Promise<WorldEdge | null>;
  deleteEdge(sourceId: string, targetId: string, tx?: GraphTransaction): Promise<void>;
  listEdges(workspaceId: string): Promise<WorldEdge[]>;

  getNeighbors(nodeId: string): Promise<WorldNode[]>;
  findPaths(sourceId: string, targetId: string, maxDepth: number): Promise<WorldEdge[][]>;
}

export interface ResearchRepository {
  findById(id: string): Promise<ResearchEntry | null>;
  listByWorkspaceId(workspaceId: string): Promise<ResearchEntry[]>;
  create(entry: Omit<ResearchEntry, 'id' | 'createdAt'>): Promise<ResearchEntry>;
}

export interface PipelineRepository {
  findById(id: string): Promise<ContentPipeline | null>;
  listByWorkspaceId(workspaceId: string): Promise<ContentPipeline[]>;
  create(pipeline: Omit<ContentPipeline, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContentPipeline>;
  updateStatus(id: string, status: ContentPipeline['status']): Promise<void>;
}

export interface IdeaRepository {
  findById(id: string): Promise<Idea | null>;
  listByWorkspaceId(workspaceId: string): Promise<Idea[]>;
  create(idea: Omit<Idea, 'id' | 'createdAt' | 'updatedAt'>): Promise<Idea>;
  update(id: string, content: string): Promise<Idea>;
}

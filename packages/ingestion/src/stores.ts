import type { ContentEntry, CreatorProfile, IngestionStatus } from './content-model.js';
import type { DedupeCandidate } from './dedupe.js';

// Persistence ports the pipeline depends on. Implemented against Supabase in the
// API layer (apps/api); implemented in-memory in tests. Keeps @pronoia/ingestion
// free of any database dependency.

export interface ContentStore {
  create(entry: ContentEntry): Promise<void>;
  update(id: string, patch: Partial<ContentEntry>): Promise<void>;
  setStatus(id: string, status: IngestionStatus, error?: string): Promise<void>;
  findById(id: string): Promise<ContentEntry | null>;
  /** Lightweight candidates for dedupe (id/url/videoId/embedding) within a workspace. */
  listDedupeCandidates(workspaceId: string): Promise<DedupeCandidate[]>;
}

export interface CreatorProfileStore {
  find(creatorId: string, workspaceId: string): Promise<CreatorProfile | null>;
  upsert(profile: CreatorProfile): Promise<void>;
}

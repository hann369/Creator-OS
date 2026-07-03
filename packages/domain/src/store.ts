// ─────────────────────────────────────────────────────────────────────────────
// THE ENTITY STORE PORT  (Roadmap Step 3)
//
// One seam for reading/writing the Entity spine + its Relationship graph. Today
// the web app talks to Supabase from three hooks with copy-pasted persistence
// logic (normalize / upsert / localStorage fallback / row mapping). This port is
// the single interface those hooks delegate to, so the mapping lives in ONE
// adapter instead of being duplicated.
//
// Direction-agnostic BY DESIGN: a client-side adapter (supabase-js in the
// browser, the current model) and a server-side/API-mediated adapter both
// implement the same interface. Strangler-fig: adapters wrap the EXISTING tables
// (`moodboards`, `relationships`, …). No big-bang collapse to one `entities`
// table — do that later only if it pays.
// ─────────────────────────────────────────────────────────────────────────────

import type { Entity, EntityType, Relationship, RelationshipType } from './entity.js';

export interface EntityStore {
  // ─── Entities (typed faces of the spine) ───────────────────────────────────
  /** All entities of a type in a workspace. */
  list<T extends Entity = Entity>(type: EntityType, workspaceId: string): Promise<T[]>;
  /** A single entity by id, or null if absent. */
  get<T extends Entity = Entity>(id: string): Promise<T | null>;
  /** Insert or update. The concrete type carries its own fields. */
  upsert<T extends Entity>(entity: T): Promise<void>;
  /** Delete by id. */
  remove(id: string): Promise<void>;

  // ─── Relationships (the unifying graph) ─────────────────────────────────────
  /** Every relationship touching an entity (as source OR target). */
  relationshipsFor(entityId: string): Promise<Relationship[]>;
  /** Create a directed relationship; returns the persisted record. Idempotent
   *  on (sourceId, targetId, type). */
  link(sourceId: string, targetId: string, type: RelationshipType, weight?: number): Promise<Relationship>;
  /** Remove a relationship by its id. */
  unlink(relationshipId: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOSITORY TABLE POLICY (Roadmap Phase C, slice 2).
//
// The generic /api/v1/repository/:table endpoint writes with the service-role
// client, which bypasses RLS. Without a fixed allowlist, any authenticated user
// could name ANY table in the URL and have the server read/write it on their
// behalf — the service role is the only thing between the request and the whole
// database. This module is that allowlist: only the per-type tables the web
// collections actually use are reachable, and each carries the scoping metadata
// the handler needs so it never stamps a column the table does not have.
//
// It is a plain data + pure function so the security boundary is unit-tested
// without a live Supabase (see apps/api/test/repository.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface TablePolicy {
  /**
   * Whether the table carries an `updated_at` column the API should stamp on
   * upsert. Mirrors each collection's `stampUpdatedAt` (createCollection): the
   * graph edges, relationships and ideation_creators tables have no such column,
   * so stamping it would make their upserts fail once routed through the API.
   */
  stampUpdatedAt: boolean;
}

// Every table backing a web `createCollection` (see apps/web/src/store and the
// entity hooks). Keep this in sync when a new collection is introduced — a table
// missing here is simply unreachable through the API adapter, which fails safe.
export const REPOSITORY_TABLES: Record<string, TablePolicy> = {
  goals:             { stampUpdatedAt: true },
  documents:         { stampUpdatedAt: true },
  assets:            { stampUpdatedAt: true },
  people:            { stampUpdatedAt: true },
  moodboards:        { stampUpdatedAt: true },
  courses:           { stampUpdatedAt: true },
  brand_identities:  { stampUpdatedAt: true },
  pipeline_cards:    { stampUpdatedAt: true },
  world_nodes:       { stampUpdatedAt: true },
  ideas:             { stampUpdatedAt: true },
  world_edges:       { stampUpdatedAt: false },
  relationships:     { stampUpdatedAt: false },
  ideation_creators: { stampUpdatedAt: false },
};

/** The policy for a table, or null when the table is not on the allowlist. */
export function repositoryTablePolicy(table: string): TablePolicy | null {
  return Object.prototype.hasOwnProperty.call(REPOSITORY_TABLES, table)
    ? REPOSITORY_TABLES[table]
    : null;
}

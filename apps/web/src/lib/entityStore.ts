import type {
  Entity,
  EntityType,
  EntityStore,
  Relationship,
  RelationshipType,
  Moodboard,
  Color,
  BoardFonts,
  MoodSection,
  WorldNode
} from '@pronoia/domain';
import { supabase } from './supabase.js';
import { getActiveWorkspaceId, scopedKey } from './workspace.js';
import { relationships as relationshipStore } from '../store/relationships.js';
import {
  nodes as nodeStore,
  cards as cardStore,
  type ExtendedContentPipeline,
} from '../store/graph.js';

export type { ExtendedContentPipeline };

// ─────────────────────────────────────────────────────────────────────────────
// Client-side EntityStore adapter (Roadmap Step 3, slice 1, 2 & 3).
//
// Wraps the EXISTING Supabase tables from the browser — same model the app
// already uses (anon key, offline-first with a localStorage mirror). Consolidates
// the relationship and entity persistence that was copy-pasted inside hooks.
//
// Relationships (../store/relationships) and the graph/pipeline
// (../store/graph) have moved out into shared collections; this adapter keeps
// the EntityStore port's shape over them so its callers stay unchanged. What is
// still owned here: moodboards, research and identities.
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'pronoia_moodboards';
const RESEARCH_LS_KEY = 'pronoia_research';
const IDENTITY_LS_KEY = 'pronoia_identities';

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

const DEFAULT_FONTS: BoardFonts = { title: 'Anton', subheading: 'Archivo', caption: 'Space Grotesk' };

// ─── Moodboard Normalization & Serialization ──────────────────────────────────
export function normalizeBoard(raw: any): Moodboard {
  const sections: MoodSection[] = Array.isArray(raw.sections) && raw.sections.length
    ? raw.sections.map((s: any) => ({
        id: s.id ?? uid('sec'),
        title: s.title ?? 'Section',
        items: (s.items ?? []).map((i: any) => {
          const kind = i.kind ?? i.type ?? 'image';
          return {
            id: i.id ?? uid('mi'),
            kind,
            ratio: i.ratio ?? (kind === 'color' ? '1:1' : '9:16'),
            label: i.label ?? '',
            imageUrl: i.imageUrl,
            color: i.color,
            caption: i.caption,
            source: i.source,
            tags: i.tags,
            score: i.score
          };
        })
      }))
    : [{
        id: uid('sec'),
        title: 'Items',
        items: (raw.items ?? []).map((i: any) => {
          const kind = i.kind ?? i.type ?? 'image';
          return {
            id: i.id ?? uid('mi'),
            kind,
            ratio: i.ratio ?? (kind === 'color' ? '1:1' : '9:16'),
            label: i.label ?? '',
            imageUrl: i.imageUrl,
            color: i.color,
            caption: i.caption,
            source: i.source,
            tags: i.tags,
            score: i.score
          };
        })
      }];

  let palette: Color[] = [];
  if (Array.isArray(raw.palette)) {
    palette = raw.palette.map((c: any) => typeof c === 'string' ? { hex: c } : c);
  } else if (Array.isArray(raw.colorPalette)) {
    palette = raw.colorPalette.map((c: any) => typeof c === 'string' ? { hex: c } : c);
  } else if (Array.isArray(raw.color_palette)) {
    palette = raw.color_palette.map((c: any) => typeof c === 'string' ? { hex: c } : c);
  }

  return {
    id: raw.id,
    workspaceId: raw.workspaceId ?? raw.workspace_id ?? getActiveWorkspaceId(),
    type: 'moodboard',
    boardType: raw.boardType ?? raw.board_type ?? 'custom',
    client: raw.client ?? raw.title ?? 'Untitled',
    title: raw.title ?? 'Untitled',
    subtitle: raw.subtitle ?? '',
    note: raw.note ?? '',
    description: raw.description ?? '',
    tags: raw.tags ?? [],
    palette,
    fonts: raw.fonts ?? DEFAULT_FONTS,
    status: raw.status ?? 'draft',
    attachedCardId: raw.attachedCardId ?? raw.attached_card_id ?? undefined,
    sections,
    notes: raw.notes ?? '',
    createdAt: new Date(raw.createdAt ?? raw.created_at ?? new Date()),
    updatedAt: new Date(raw.updatedAt ?? raw.updated_at ?? new Date()),
    metadata: raw.metadata ?? {}
  };
}

export function boardToRow(b: Moodboard) {
  return {
    id: b.id,
    workspace_id: b.workspaceId,
    title: b.title,
    description: b.description,
    tags: b.tags,
    color_palette: b.palette,
    status: b.status,
    attached_card_id: b.attachedCardId ?? null,
    notes: b.notes,
    board_type: b.boardType,
    client: b.client,
    subtitle: b.subtitle,
    note: b.note,
    fonts: b.fonts,
    sections: b.sections,
    created_at: b.createdAt.toISOString(),
    updated_at: b.updatedAt.toISOString(),
    metadata: b.metadata ?? {}
  };
}

export function loadBoardsLocal(): Moodboard[] {
  try {
    const rawStr = localStorage.getItem(scopedKey(LS_KEY));
    if (rawStr) return (JSON.parse(rawStr) as any[]).map(normalizeBoard);
  } catch { /* ignore */ }
  return [];
}

export function persistBoardsLocal(boards: Moodboard[]) {
  try { localStorage.setItem(scopedKey(LS_KEY), JSON.stringify(boards)); } catch { /* ignore */ }
}

// Reconstruct a BrandIdentity entity from a brand_identities row (rich fields in `data`).
function rowToIdentity(row: any): Entity {
  const data = row.data ?? {};
  return {
    ...data,
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    type: 'identity',
    title: row.title ?? data.title ?? 'Brand Identity',
    metadata: data.metadata ?? {},
    createdAt: new Date(row.created_at ?? new Date()),
    updatedAt: new Date(row.updated_at ?? new Date()),
  } as Entity;
}

/**
 * Supabase-backed EntityStore for the browser.
 */
export class SupabaseEntityStore implements EntityStore {
  // ─── Relationships ──────────────────────────────────────────────────────────

  // Persistence and row mapping live in the shared collection
  // (../store/relationships). These methods keep the EntityStore port's async
  // shape for callers, but every write now lands in the store mounted views read.

  /** Load the full relationship set for the workspace (Supabase → localStorage
   *  fallback). Kept as a bulk read because the app filters in memory. */
  async loadAll(): Promise<Relationship[]> {
    await relationshipStore.load();
    return relationshipStore.getAll();
  }

  async relationshipsFor(entityId: string): Promise<Relationship[]> {
    const all = await this.loadAll();
    return all.filter(r => r.sourceId === entityId || r.targetId === entityId);
  }

  async link(sourceId: string, targetId: string, type: RelationshipType, weight?: number): Promise<Relationship> {
    const rel: Relationship = {
      id: uid('rel'), workspaceId: getActiveWorkspaceId(), sourceId, targetId, type,
      ...(weight != null ? { weight } : {}),
      createdAt: new Date(),
    };
    await this.save(rel);
    return rel;
  }

  /** Persist a pre-built relationship record (keeps a caller's optimistic id).
   *  Adapter-level helper beyond the port — used by the optimistic client hook. */
  async save(rel: Relationship): Promise<void> {
    await relationshipStore.load();
    relationshipStore.add(rel);
  }

  async unlink(relationshipId: string): Promise<void> {
    await relationshipStore.load();
    relationshipStore.remove(relationshipId);
  }

  // ─── Entities (slice 2 & 3) ─────────────────────────────────────────────────────

  async list<T extends Entity = Entity>(type: EntityType, workspaceId: string): Promise<T[]> {
    if (type === 'moodboard') {
      try {
        const { data, error } = await supabase
          .from('moodboards')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (!error && data) {
          const mapped = data.map(normalizeBoard) as unknown as T[];
          persistBoardsLocal(mapped as unknown as Moodboard[]);
          return mapped;
        }
      } catch (err) {
        console.warn('Supabase moodboards list failed, falling back to local storage:', err);
      }
      return loadBoardsLocal() as unknown as T[];
    }

    if (type === 'research') {
      return this.loadResearchLocal() as unknown as T[];
    }

    if (type === 'identity') {
      try {
        const { data, error } = await supabase
          .from('brand_identities')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (!error && data) {
          const mapped = data.map(rowToIdentity) as unknown as T[];
          this.persistIdentitiesLocal(mapped as unknown as Entity[]);
          return mapped;
        }
      } catch (err) {
        console.warn('Supabase brand_identities list failed, falling back to local:', err);
      }
      return this.loadIdentitiesLocal() as unknown as T[];
    }

    // Graph and pipeline live in the shared collections, which are scoped to the
    // active project — the workspaceId argument is redundant for them.
    if (type === 'concept' || type === 'goal' || type === 'project') {
      await nodeStore.load();
      return nodeStore.getAll().filter(n => n.type === type) as unknown as T[];
    }

    if (type === 'pipeline_card') {
      await cardStore.load();
      return cardStore.getAll() as unknown as T[];
    }

    throw new Error(`EntityStore.list: entity type ${type} persistence lands in a later step`);
  }

  async get<T extends Entity = Entity>(id: string): Promise<T | null> {
    if (id.startsWith('mb-') || id.startsWith('mb_') || id.includes('mb')) {
      try {
        const { data, error } = await supabase
          .from('moodboards')
          .select('*')
          .eq('id', id)
          .single();
        if (!error && data) {
          return normalizeBoard(data) as unknown as T;
        }
      } catch (err) {
        console.warn('Supabase moodboard get failed, checking local:', err);
      }
      const local = loadBoardsLocal();
      return (local.find(b => b.id === id) ?? null) as unknown as T | null;
    }

    if (id.startsWith('identity-')) {
      try {
        const { data, error } = await supabase.from('brand_identities').select('*').eq('id', id).single();
        if (!error && data) return rowToIdentity(data) as unknown as T;
      } catch { /* fall through to local */ }
      const local = this.loadIdentitiesLocal();
      return (local.find(r => r.id === id) ?? null) as unknown as T | null;
    }

    if (id.startsWith('res-') || id.startsWith('research-')) {
      const local = this.loadResearchLocal();
      return (local.find(r => r.id === id) ?? null) as unknown as T | null;
    }

    if (id.startsWith('node-') || id.startsWith('card:')) {
      await nodeStore.load();
      return (nodeStore.getAll().find(n => n.id === id) ?? null) as unknown as T | null;
    }

    if (id.startsWith('card-')) {
      await cardStore.load();
      return (cardStore.getAll().find(c => c.id === id) ?? null) as unknown as T | null;
    }

    throw new Error(`EntityStore.get: entity persistence for id ${id} lands in a later step`);
  }

  async upsert<T extends Entity>(entity: T): Promise<void> {
    if (entity.type === 'moodboard') {
      const board = entity as unknown as Moodboard;
      try {
        const { error } = await supabase
          .from('moodboards')
          .upsert(boardToRow(board), { onConflict: 'id' });
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase moodboard upsert failed, syncing to local fallback:', err);
      }
      // Also save in local fallback
      const local = loadBoardsLocal();
      const idx = local.findIndex(b => b.id === board.id);
      if (idx >= 0) {
        local[idx] = board;
      } else {
        local.push(board);
      }
      persistBoardsLocal(local);
      return;
    }

    if (entity.type === 'research') {
      const local = this.loadResearchLocal();
      const idx = local.findIndex(r => r.id === entity.id);
      if (idx >= 0) {
        local[idx] = entity;
      } else {
        local.push(entity);
      }
      this.persistResearchLocal(local);

      // Try to save to Supabase generic research/entities table if it exists (catch/ignore if not)
      try {
        await supabase
          .from('research')
          .upsert({
            id: entity.id,
            workspace_id: entity.workspaceId,
            title: entity.title,
            metadata: entity.metadata,
            created_at: entity.createdAt.toISOString(),
            updated_at: entity.updatedAt.toISOString(),
          }, { onConflict: 'id' });
      } catch { /* expected if table doesn't exist yet */ }
      return;
    }

    if (entity.type === 'identity') {
      const local = this.loadIdentitiesLocal();
      const idx = local.findIndex(r => r.id === entity.id);
      if (idx >= 0) local[idx] = entity; else local.push(entity);
      this.persistIdentitiesLocal(local);
      try {
        await supabase.from('brand_identities').upsert({
          id: entity.id,
          workspace_id: entity.workspaceId,
          title: entity.title,
          data: entity,
          created_at: entity.createdAt.toISOString(),
          updated_at: entity.updatedAt.toISOString(),
        }, { onConflict: 'id' });
      } catch { /* table may be absent — local fallback keeps it */ }
      return;
    }

    // World node types
    if (entity.type === 'concept' || entity.type === 'goal' || entity.type === 'project') {
      await nodeStore.load();
      nodeStore.add(entity as unknown as WorldNode);
      return;
    }

    // Content Pipeline card
    if (entity.type === 'pipeline_card') {
      await cardStore.load();
      cardStore.add(entity as unknown as ExtendedContentPipeline);
      return;
    }

    throw new Error(`EntityStore.upsert: entity type ${entity.type} persistence lands in a later step`);
  }

  async remove(id: string): Promise<void> {
    if (id.startsWith('mb-') || id.startsWith('mb_') || id.includes('mb')) {
      try {
        const { error } = await supabase.from('moodboards').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase moodboard delete failed, updating local fallback:', err);
      }
      const local = loadBoardsLocal();
      const next = local.filter(b => b.id !== id);
      persistBoardsLocal(next);
      return;
    }

    if (id.startsWith('node-') || id.startsWith('card:')) {
      await nodeStore.load();
      nodeStore.remove(id);
      return;
    }

    if (id.startsWith('card-')) {
      await cardStore.load();
      cardStore.remove(id);
      return;
    }

    throw new Error(`EntityStore.remove: entity persistence for id ${id} lands in a later step`);
  }

  private loadResearchLocal(): Entity[] {
    try {
      const raw = localStorage.getItem(scopedKey(RESEARCH_LS_KEY));
      if (raw) {
        return (JSON.parse(raw) as any[]).map(r => ({
          ...r,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        }));
      }
    } catch { /* ignore */ }
    return [];
  }

  private loadIdentitiesLocal(): Entity[] {
    try {
      const raw = localStorage.getItem(scopedKey(IDENTITY_LS_KEY));
      if (raw) {
        return (JSON.parse(raw) as any[]).map(r => ({
          ...r,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        }));
      }
    } catch { /* ignore */ }
    return [];
  }

  private persistIdentitiesLocal(items: Entity[]) {
    try {
      localStorage.setItem(scopedKey(IDENTITY_LS_KEY), JSON.stringify(items));
    } catch { /* ignore */ }
  }

  private persistResearchLocal(items: Entity[]) {
    try {
      localStorage.setItem(scopedKey(RESEARCH_LS_KEY), JSON.stringify(items));
    } catch { /* ignore */ }
  }
}

/** Shared singleton — mirrors the supabase client's singleton pattern. */
export const entityStore = new SupabaseEntityStore();

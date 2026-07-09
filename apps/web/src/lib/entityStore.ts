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
  WorldNode, 
  WorldEdge, 
  ContentPipeline 
} from '@pronoia/domain';
import { supabase } from './supabase.js';
import { getActiveWorkspaceId, scopedKey } from './workspace.js';

// Extended pipeline card type supporting checklists, markdown editor bodies, comments, and attachments
export interface ExtendedContentPipeline extends ContentPipeline {
  markdown?: string;
  checklists?: { id: string; text: string; done: boolean }[];
  attachments?: { id: string; name: string; type: string; url?: string }[];
  comments?: { id: string; author: string; text: string; createdAt: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side EntityStore adapter (Roadmap Step 3, slice 1, 2 & 3).
//
// Wraps the EXISTING Supabase tables from the browser — same model the app
// already uses (anon key, offline-first with a localStorage mirror). Consolidates
// the relationship and entity persistence that was copy-pasted inside hooks.
// ─────────────────────────────────────────────────────────────────────────────

const REL_LS_KEY = 'pronoia_relationships';
const LS_KEY = 'pronoia_moodboards';
const NODES_LS_KEY = 'pronoia_nodes';
const EDGES_LS_KEY = 'pronoia_edges';
const CARDS_LS_KEY = 'pronoia_cards';
const RESEARCH_LS_KEY = 'pronoia_research';
const IDENTITY_LS_KEY = 'pronoia_identities';

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

const DEFAULT_FONTS: BoardFonts = { title: 'Anton', subheading: 'Archivo', caption: 'Space Grotesk' };

// ─── Relationship Mappers ────────────────────────────────────────────────────
function normalizeRel(raw: any): Relationship {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId ?? raw.workspace_id ?? getActiveWorkspaceId(),
    sourceId: raw.sourceId ?? raw.source_id,
    targetId: raw.targetId ?? raw.target_id,
    type: raw.type ?? raw.relationship_type,
    weight: raw.weight != null ? parseFloat(raw.weight) : undefined,
    metadata: raw.metadata ?? {},
    createdAt: new Date(raw.createdAt ?? raw.created_at ?? new Date()),
  };
}

function relToRow(r: Relationship) {
  return {
    id: r.id,
    workspace_id: r.workspaceId,
    source_id: r.sourceId,
    target_id: r.targetId,
    type: r.type,
    weight: r.weight ?? null,
    metadata: r.metadata ?? {},
    created_at: r.createdAt.toISOString(),
  };
}

function loadRelsLocal(): Relationship[] {
  try {
    const raw = localStorage.getItem(scopedKey(REL_LS_KEY));
    if (raw) return (JSON.parse(raw) as any[]).map(normalizeRel);
  } catch { /* ignore */ }
  return [];
}

function persistRelsLocal(rels: Relationship[]) {
  try { localStorage.setItem(scopedKey(REL_LS_KEY), JSON.stringify(rels)); } catch { /* ignore */ }
}

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

// ─── World Node, Edge and Card Mappers ────────────────────────────────────────
export function rowToNode(row: any): WorldNode {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    name: row.name,
    type: row.type,
    description: row.description,
    confidence: row.confidence,
    lifecycleState: row.lifecycle_state,
    sourceCount: row.source_count,
    metadata: row.metadata ?? {},
    derivedFrom: [],
    lastVerified: new Date(row.updated_at ?? row.created_at ?? new Date()),
    createdAt: new Date(row.created_at ?? new Date()),
    updatedAt: new Date(row.updated_at ?? new Date())
  };
}

export function nodeToRow(node: WorldNode) {
  return {
    id: node.id,
    workspace_id: node.workspaceId,
    name: node.name,
    type: node.type,
    description: node.description,
    confidence: node.confidence,
    lifecycle_state: node.lifecycleState,
    source_count: node.sourceCount,
    metadata: node.metadata ?? {}
  };
}

export function rowToEdge(row: any): WorldEdge {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    sourceId: row.source_id,
    targetId: row.target_id,
    weight: row.weight != null ? parseFloat(row.weight) : 1.0,
    relationshipType: row.relationship_type,
    confidence: row.confidence,
    createdAt: new Date(row.created_at ?? new Date())
  };
}

export function edgeToRow(edge: WorldEdge) {
  return {
    id: edge.id,
    workspace_id: edge.workspaceId,
    source_id: edge.sourceId,
    target_id: edge.targetId,
    weight: edge.weight,
    relationship_type: edge.relationshipType,
    confidence: edge.confidence
  };
}

export function rowToCard(row: any): ExtendedContentPipeline {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? getActiveWorkspaceId(),
    title: row.title,
    hook: row.hook,
    format: row.format,
    status: row.status,
    platforms: row.platforms ?? [],
    trendScore: row.trend_score,
    executivePriority: row.executive_priority,
    markdown: row.markdown,
    checklists: row.checklists ?? [],
    attachments: row.attachments ?? [],
    comments: row.comments ?? [],
    linkedNodeIds: [],
    createdAt: new Date(row.created_at ?? new Date()),
    updatedAt: new Date(row.updated_at ?? new Date())
  };
}

export function cardToRow(c: ExtendedContentPipeline) {
  return {
    id: c.id,
    workspace_id: c.workspaceId,
    title: c.title,
    hook: c.hook,
    format: c.format,
    status: c.status,
    platforms: c.platforms,
    trend_score: c.trendScore,
    executive_priority: c.executivePriority,
    markdown: c.markdown,
    checklists: c.checklists,
    attachments: c.attachments,
    comments: c.comments
  };
}

// ─── Local Storage helpers for Slice 3 ────────────────────────────────────────
function loadNodesLocal(): WorldNode[] {
  try {
    const raw = localStorage.getItem(scopedKey(NODES_LS_KEY));
    if (raw) return (JSON.parse(raw) as any[]).map(rowToNode);
  } catch {}
  return [];
}
function persistNodesLocal(nodes: WorldNode[]) {
  try { localStorage.setItem(scopedKey(NODES_LS_KEY), JSON.stringify(nodes)); } catch {}
}

function loadEdgesLocal(): WorldEdge[] {
  try {
    const raw = localStorage.getItem(scopedKey(EDGES_LS_KEY));
    if (raw) return (JSON.parse(raw) as any[]).map(rowToEdge);
  } catch {}
  return [];
}
function persistEdgesLocal(edges: WorldEdge[]) {
  try { localStorage.setItem(scopedKey(EDGES_LS_KEY), JSON.stringify(edges)); } catch {}
}

function loadCardsLocal(): ExtendedContentPipeline[] {
  try {
    const raw = localStorage.getItem(scopedKey(CARDS_LS_KEY));
    if (raw) return (JSON.parse(raw) as any[]).map(rowToCard);
  } catch {}
  return [];
}
function persistCardsLocal(cards: ExtendedContentPipeline[]) {
  try { localStorage.setItem(scopedKey(CARDS_LS_KEY), JSON.stringify(cards)); } catch {}
}

/**
 * Supabase-backed EntityStore for the browser.
 */
export class SupabaseEntityStore implements EntityStore {
  // ─── Relationships ──────────────────────────────────────────────────────────

  /** Load the full relationship set for the workspace (Supabase → localStorage
   *  fallback). Kept as a bulk read because the app filters in memory. */
  async loadAll(): Promise<Relationship[]> {
    try {
      const { data, error } = await supabase
        .from('relationships').select('*').eq('workspace_id', getActiveWorkspaceId());
      if (!error && data) {
        const mapped = data.map(normalizeRel);
        persistRelsLocal(mapped);
        return mapped;
      }
    } catch { /* offline / no table → localStorage */ }
    return loadRelsLocal();
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
    try {
      const { error } = await supabase.from('relationships').upsert(relToRow(rel), { onConflict: 'id' });
      if (error) throw error;
    } catch (err) {
      console.warn('Supabase relationship upsert failed, syncing to local fallback:', err);
    }
    // Also save in local fallback
    const local = loadRelsLocal();
    const idx = local.findIndex(r => r.id === rel.id);
    if (idx >= 0) {
      local[idx] = rel;
    } else {
      local.push(rel);
    }
    persistRelsLocal(local);
  }

  async unlink(relationshipId: string): Promise<void> {
    try {
      const { error } = await supabase.from('relationships').delete().eq('id', relationshipId);
      if (error) throw error;
    } catch (err) {
      console.warn('Supabase relationship delete failed, updating local fallback:', err);
    }
    // Update local fallback
    const local = loadRelsLocal();
    const next = local.filter(r => r.id !== relationshipId);
    persistRelsLocal(next);
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

    // World node types stored in world_nodes table
    if (type === 'concept' || type === 'goal' || type === 'project') {
      try {
        const { data, error } = await supabase
          .from('world_nodes')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('type', type);
        if (!error && data) {
          const mapped = data.map(rowToNode) as unknown as T[];
          // Update cached nodes locally
          const cached = loadNodesLocal().filter(n => n.type !== type);
          persistNodesLocal([...cached, ...mapped as unknown as WorldNode[]]);
          return mapped;
        }
      } catch (err) {
        console.warn(`Supabase world_nodes list failed for ${type}, falling back:`, err);
      }
      return loadNodesLocal().filter(n => n.type === type) as unknown as T[];
    }

    if (type === 'pipeline_card') {
      try {
        const { data, error } = await supabase
          .from('pipeline_cards')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (!error && data) {
          const mapped = data.map(rowToCard) as unknown as T[];
          persistCardsLocal(mapped as unknown as ExtendedContentPipeline[]);
          return mapped;
        }
      } catch (err) {
        console.warn('Supabase pipeline_cards list failed, falling back:', err);
      }
      return loadCardsLocal() as unknown as T[];
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
      try {
        const { data, error } = await supabase
          .from('world_nodes')
          .select('*')
          .eq('id', id)
          .single();
        if (!error && data) {
          return rowToNode(data) as unknown as T;
        }
      } catch (err) {
        console.warn('Supabase world_nodes get failed, checking local:', err);
      }
      return (loadNodesLocal().find(n => n.id === id) ?? null) as unknown as T | null;
    }

    if (id.startsWith('card-')) {
      try {
        const { data, error } = await supabase
          .from('pipeline_cards')
          .select('*')
          .eq('id', id)
          .single();
        if (!error && data) {
          return rowToCard(data) as unknown as T;
        }
      } catch (err) {
        console.warn('Supabase pipeline_cards get failed, checking local:', err);
      }
      return (loadCardsLocal().find(c => c.id === id) ?? null) as unknown as T | null;
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
      const node = entity as unknown as WorldNode;
      try {
        const { error } = await supabase
          .from('world_nodes')
          .upsert(nodeToRow(node), { onConflict: 'id' });
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase world_nodes upsert failed, syncing to local fallback:', err);
      }
      const local = loadNodesLocal();
      const idx = local.findIndex(n => n.id === node.id);
      if (idx >= 0) {
        local[idx] = node;
      } else {
        local.push(node);
      }
      persistNodesLocal(local);
      return;
    }

    // Content Pipeline card
    if (entity.type === 'pipeline_card') {
      const card = entity as unknown as ExtendedContentPipeline;
      try {
        const { error } = await supabase
          .from('pipeline_cards')
          .upsert(cardToRow(card), { onConflict: 'id' });
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase pipeline_cards upsert failed, syncing to local fallback:', err);
      }
      const local = loadCardsLocal();
      const idx = local.findIndex(c => c.id === card.id);
      if (idx >= 0) {
        local[idx] = card;
      } else {
        local.push(card);
      }
      persistCardsLocal(local);
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
      try {
        const { error } = await supabase.from('world_nodes').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase world_nodes delete failed, updating local fallback:', err);
      }
      const local = loadNodesLocal();
      const next = local.filter(n => n.id !== id);
      persistNodesLocal(next);
      return;
    }

    if (id.startsWith('card-')) {
      try {
        const { error } = await supabase.from('pipeline_cards').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase pipeline_cards delete failed, updating local fallback:', err);
      }
      const local = loadCardsLocal();
      const next = local.filter(c => c.id !== id);
      persistCardsLocal(next);
      return;
    }

    throw new Error(`EntityStore.remove: entity persistence for id ${id} lands in a later step`);
  }

  // ─── Custom class methods to make Slice 3 delegation in WorkspaceContext extremely clean ───
  async loadNodes(workspaceId: string): Promise<WorldNode[]> {
    try {
      const { data, error } = await supabase
        .from('world_nodes')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (!error && data) {
        const mapped = data.map(rowToNode);
        persistNodesLocal(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase world_nodes load failed, using local fallback:', err);
    }
    return loadNodesLocal();
  }

  async loadEdges(workspaceId: string): Promise<WorldEdge[]> {
    try {
      const { data, error } = await supabase
        .from('world_edges')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (!error && data) {
        const mapped = data.map(rowToEdge);
        persistEdgesLocal(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase world_edges load failed, using local fallback:', err);
    }
    return loadEdgesLocal();
  }

  async saveEdge(edge: WorldEdge): Promise<void> {
    try {
      const { error } = await supabase
        .from('world_edges')
        .upsert(edgeToRow(edge), { onConflict: 'id' });
      if (error) throw error;
    } catch (err) {
      console.warn('Supabase world_edges save failed, caching locally:', err);
    }
    const local = loadEdgesLocal();
    const idx = local.findIndex(e => e.id === edge.id);
    if (idx >= 0) {
      local[idx] = edge;
    } else {
      local.push(edge);
    }
    persistEdgesLocal(local);
  }

  async deleteEdge(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('world_edges').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.warn('Supabase world_edges delete failed, caching locally:', err);
    }
    const local = loadEdgesLocal();
    const next = local.filter(e => e.id !== id);
    persistEdgesLocal(next);
  }

  async loadCards(workspaceId: string): Promise<ExtendedContentPipeline[]> {
    try {
      const { data, error } = await supabase
        .from('pipeline_cards')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (!error && data) {
        const mapped = data.map(rowToCard);
        persistCardsLocal(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase pipeline_cards load failed, using local fallback:', err);
    }
    return loadCardsLocal();
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

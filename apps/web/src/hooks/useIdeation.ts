import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId, scopedKey } from '../lib/workspace.js';

// The Ideation Portal (mirrors the Notion "Ideation Portal"): a Hitlist of
// inspiration creators + an Idea Bank of rated, status-tracked ideas. Project-
// scoped (Supabase + offline localStorage mirror).

export const IDEA_STATUSES = ['Idea', 'Draft', 'Ready To Record', 'Editing', 'Ready To Post', 'Posted'] as const;
export type IdeaStatus = typeof IDEA_STATUSES[number];

export interface Creator {
  id: string;
  workspaceId: string;
  name: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  favorite: boolean;
  createdAt: Date;
}

export interface Idea {
  id: string;
  workspaceId: string;
  title: string;
  status: IdeaStatus;
  rating: number;            // 0..5
  creatorId?: string;        // → Creator.id
  inspirationUrl?: string;
  painPoints?: string;
  packagingQuestions?: string;
  archived: boolean;
  promotedCardId?: string;   // → pipeline card once promoted
  createdAt: Date;
  updatedAt: Date;
}

const CREATORS_LS = 'pronoia_creators';
const IDEAS_LS = 'pronoia_ideas';
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

// ─── mappers ──────────────────────────────────────────────────────────────
function rowToCreator(r: any): Creator {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    name: r.name ?? '', instagramUrl: r.instagram_url ?? undefined, youtubeUrl: r.youtube_url ?? undefined,
    favorite: !!r.favorite, createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
  };
}
function creatorToRow(c: Creator) {
  return { id: c.id, workspace_id: c.workspaceId, name: c.name, instagram_url: c.instagramUrl ?? null, youtube_url: c.youtubeUrl ?? null, favorite: c.favorite, created_at: c.createdAt.toISOString() };
}
function rowToIdea(r: any): Idea {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    title: r.title ?? '', status: (r.status ?? 'Idea') as IdeaStatus, rating: r.rating ?? 0,
    creatorId: r.creator_id ?? r.creatorId ?? undefined, inspirationUrl: r.inspiration_url ?? r.inspirationUrl ?? undefined,
    painPoints: r.pain_points ?? r.painPoints ?? undefined, packagingQuestions: r.packaging_questions ?? r.packagingQuestions ?? undefined,
    archived: !!r.archived, promotedCardId: r.promoted_card_id ?? r.promotedCardId ?? undefined,
    createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()), updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
  };
}
function ideaToRow(i: Idea) {
  return {
    id: i.id, workspace_id: i.workspaceId, title: i.title, status: i.status, rating: i.rating,
    creator_id: i.creatorId ?? null, inspiration_url: i.inspirationUrl ?? null, pain_points: i.painPoints ?? null,
    packaging_questions: i.packagingQuestions ?? null, archived: i.archived, promoted_card_id: i.promotedCardId ?? null,
    created_at: i.createdAt.toISOString(), updated_at: i.updatedAt.toISOString(),
  };
}

function loadLocal<T>(key: string, map: (r: any) => T): T[] {
  try { const raw = localStorage.getItem(scopedKey(key)); if (raw) return (JSON.parse(raw) as any[]).map(map); } catch { /* ignore */ }
  return [];
}
function persistLocal(key: string, items: unknown[]) {
  try { localStorage.setItem(scopedKey(key), JSON.stringify(items)); } catch { /* ignore */ }
}

export function useIdeation() {
  const [creators, setCreators] = useState<Creator[]>(() => loadLocal(CREATORS_LS, rowToCreator));
  const [ideas, setIdeas] = useState<Idea[]>(() => loadLocal(IDEAS_LS, rowToIdea));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ws = getActiveWorkspaceId();
      try {
        const [c, i] = await Promise.all([
          supabase.from('ideation_creators').select('*').eq('workspace_id', ws),
          supabase.from('ideas').select('*').eq('workspace_id', ws),
        ]);
        if (cancelled) return;
        if (!c.error && c.data) { const m = c.data.map(rowToCreator); setCreators(m); persistLocal(CREATORS_LS, c.data); }
        if (!i.error && i.data) { const m = i.data.map(rowToIdea); setIdeas(m); persistLocal(IDEAS_LS, i.data); }
      } catch { /* offline → keep local */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Creators (Hitlist) ───────────────────────────────────────────────────
  const addCreator = useCallback((name: string, instagramUrl?: string, youtubeUrl?: string): Creator => {
    const c: Creator = { id: uid('cr'), workspaceId: getActiveWorkspaceId(), name: name.trim() || 'Unnamed', instagramUrl, youtubeUrl, favorite: false, createdAt: new Date() };
    setCreators(prev => { const next = [...prev, c]; persistLocal(CREATORS_LS, next.map(creatorToRow)); return next; });
    supabase.from('ideation_creators').upsert(creatorToRow(c), { onConflict: 'id' }).then(() => {}, () => {});
    return c;
  }, []);

  const updateCreator = useCallback((id: string, patch: Partial<Creator>) => {
    setCreators(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...patch } : c);
      persistLocal(CREATORS_LS, next.map(creatorToRow));
      const updated = next.find(c => c.id === id);
      if (updated) supabase.from('ideation_creators').upsert(creatorToRow(updated), { onConflict: 'id' }).then(() => {}, () => {});
      return next;
    });
  }, []);

  const deleteCreator = useCallback((id: string) => {
    setCreators(prev => { const next = prev.filter(c => c.id !== id); persistLocal(CREATORS_LS, next.map(creatorToRow)); return next; });
    supabase.from('ideation_creators').delete().eq('id', id).then(() => {}, () => {});
  }, []);

  // ─── Ideas (Idea Bank) ────────────────────────────────────────────────────
  const addIdea = useCallback((title: string): Idea => {
    const now = new Date();
    const i: Idea = { id: uid('idea'), workspaceId: getActiveWorkspaceId(), title: title.trim() || 'New idea', status: 'Idea', rating: 0, archived: false, createdAt: now, updatedAt: now };
    setIdeas(prev => { const next = [...prev, i]; persistLocal(IDEAS_LS, next.map(ideaToRow)); return next; });
    supabase.from('ideas').upsert(ideaToRow(i), { onConflict: 'id' }).then(() => {}, () => {});
    return i;
  }, []);

  const updateIdea = useCallback((id: string, patch: Partial<Idea>) => {
    setIdeas(prev => {
      const next = prev.map(i => i.id === id ? { ...i, ...patch, updatedAt: new Date() } : i);
      persistLocal(IDEAS_LS, next.map(ideaToRow));
      const updated = next.find(i => i.id === id);
      if (updated) supabase.from('ideas').upsert(ideaToRow(updated), { onConflict: 'id' }).then(() => {}, () => {});
      return next;
    });
  }, []);

  const deleteIdea = useCallback((id: string) => {
    setIdeas(prev => { const next = prev.filter(i => i.id !== id); persistLocal(IDEAS_LS, next.map(ideaToRow)); return next; });
    supabase.from('ideas').delete().eq('id', id).then(() => {}, () => {});
  }, []);

  return { creators, ideas, addCreator, updateCreator, deleteCreator, addIdea, updateIdea, deleteIdea };
}

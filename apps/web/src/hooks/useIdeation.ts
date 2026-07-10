import { useCallback } from 'react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { creators as creatorStore, ideas as ideaStore } from '../store/ideation.js';

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
  projectId?: string;        // → Project.id
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

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

// Row mapping and persistence live in ../store/ideation (Roadmap Phase B). Both
// collections are account-scoped, so ideas the Telegram bot filed into another
// project still arrive here and IdeationView can filter them client-side.
export function useIdeation() {
  const creators = creatorStore.useItems();
  const ideas = ideaStore.useItems();

  // ─── Creators (Hitlist) ───────────────────────────────────────────────────
  const addCreator = useCallback((name: string, instagramUrl?: string, youtubeUrl?: string): Creator => {
    const c: Creator = { id: uid('cr'), workspaceId: getActiveWorkspaceId(), name: name.trim() || 'Unnamed', instagramUrl, youtubeUrl, favorite: false, createdAt: new Date() };
    creatorStore.add(c);
    return c;
  }, []);

  const updateCreator = useCallback((id: string, patch: Partial<Creator>) => creatorStore.update(id, patch), []);
  const deleteCreator = useCallback((id: string) => creatorStore.remove(id), []);

  // ─── Ideas (Idea Bank) ────────────────────────────────────────────────────
  const addIdea = useCallback((title: string, projectId?: string): Idea => {
    const now = new Date();
    const targetProject = projectId || getActiveWorkspaceId();
    const i: Idea = {
      id: uid('idea'),
      workspaceId: targetProject,
      projectId: targetProject !== 'main-space' ? targetProject : undefined,
      title: title.trim() || 'New idea',
      status: 'Idea',
      rating: 0,
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    ideaStore.add(i);
    return i;
  }, []);

  const updateIdea = useCallback((id: string, patch: Partial<Idea>) => ideaStore.update(id, patch), []);
  const deleteIdea = useCallback((id: string) => ideaStore.remove(id), []);

  return { creators, ideas, addCreator, updateCreator, deleteCreator, addIdea, updateIdea, deleteIdea };
}

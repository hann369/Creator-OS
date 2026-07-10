import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from './collection.js';
import type { Creator, Idea, IdeaStatus } from '../hooks/useIdeation.js';

// Ideation Portal state (Roadmap Phase B): the Hitlist of inspiration creators
// and the Idea Bank.
//
// Both are ACCOUNT-scoped, not project-scoped: IdeationView shows every idea and
// filters by project client-side, and the Telegram bot files captured ideas into
// whichever project is active on the bot side. Narrowing the query to the open
// project would hide those.

function rowToCreator(r: any): Creator {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    name: r.name ?? '', instagramUrl: r.instagram_url ?? undefined, youtubeUrl: r.youtube_url ?? undefined,
    favorite: !!r.favorite, createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
  };
}
function creatorToRow(c: Creator) {
  return {
    id: c.id, workspace_id: c.workspaceId, name: c.name,
    instagram_url: c.instagramUrl ?? null, youtube_url: c.youtubeUrl ?? null,
    favorite: c.favorite, created_at: c.createdAt.toISOString(),
  };
}

function rowToIdea(r: any): Idea {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    projectId: r.project_id ?? undefined,
    title: r.title ?? '', status: (r.status ?? 'Idea') as IdeaStatus, rating: r.rating ?? 0,
    creatorId: r.creator_id ?? r.creatorId ?? undefined,
    inspirationUrl: r.inspiration_url ?? r.inspirationUrl ?? undefined,
    painPoints: r.pain_points ?? r.painPoints ?? undefined,
    packagingQuestions: r.packaging_questions ?? r.packagingQuestions ?? undefined,
    archived: !!r.archived, promotedCardId: r.promoted_card_id ?? r.promotedCardId ?? undefined,
    createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
    updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
  };
}
function ideaToRow(i: Idea) {
  return {
    id: i.id, workspace_id: i.workspaceId, project_id: i.projectId ?? null, title: i.title,
    status: i.status, rating: i.rating, creator_id: i.creatorId ?? null,
    inspiration_url: i.inspirationUrl ?? null, pain_points: i.painPoints ?? null,
    packaging_questions: i.packagingQuestions ?? null, archived: i.archived,
    promoted_card_id: i.promotedCardId ?? null,
    created_at: i.createdAt.toISOString(), updated_at: i.updatedAt.toISOString(),
  };
}

export const creators = createCollection<Creator>({
  table: 'ideation_creators', lsKey: 'pronoia_creators', idOf: (c) => c.id,
  fromRow: rowToCreator, toRow: creatorToRow, scope: 'account',
});

export const ideas = createCollection<Idea>({
  table: 'ideas', lsKey: 'pronoia_ideas', idOf: (i) => i.id,
  fromRow: rowToIdea, toRow: ideaToRow, stampUpdatedAt: true, scope: 'account',
});

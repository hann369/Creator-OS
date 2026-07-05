import { useCallback } from 'react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from '../store/collection.js';

// Goals as a first-class, project-scoped store (mirrors GoalEntity in
// packages/domain). Backed by the shared entity collection (Roadmap Phase B), so
// every caller — GoalsView and the sidebar ProjectProgress — reads ONE store and
// stays in sync instead of holding independent useState copies.

export const GOAL_STATUSES = ['active', 'achieved', 'archived'] as const;
export type GoalStatus = typeof GOAL_STATUSES[number];

export interface Goal {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  targetDate?: Date;
  progress: number; // 0..1
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
}

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

function rowToGoal(r: any): Goal {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    title: r.title ?? '', description: r.description ?? '',
    targetDate: r.target_date ?? r.targetDate ? new Date(r.target_date ?? r.targetDate) : undefined,
    progress: typeof r.progress === 'number' ? r.progress : 0,
    status: (r.status ?? 'active') as GoalStatus,
    createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
    updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
  };
}
function goalToRow(g: Goal) {
  return {
    id: g.id, workspace_id: g.workspaceId, title: g.title, description: g.description,
    target_date: g.targetDate ? g.targetDate.toISOString() : null,
    progress: g.progress, status: g.status,
    created_at: g.createdAt.toISOString(), updated_at: g.updatedAt.toISOString(),
  };
}

const goals = createCollection<Goal>({
  table: 'goals', lsKey: 'pronoia_goals', idOf: (g) => g.id,
  fromRow: rowToGoal, toRow: goalToRow, stampUpdatedAt: true,
});

export function useGoals() {
  const items = goals.useItems();

  const addGoal = useCallback((title: string, description = ''): Goal => {
    const now = new Date();
    const g: Goal = { id: uid('goal'), workspaceId: getActiveWorkspaceId(), title: title.trim() || 'New goal', description, progress: 0, status: 'active', createdAt: now, updatedAt: now };
    goals.add(g);
    return g;
  }, []);

  const updateGoal = useCallback((id: string, patch: Partial<Goal>) => goals.update(id, patch), []);
  const deleteGoal = useCallback((id: string) => goals.remove(id), []);

  return { goals: items, addGoal, updateGoal, deleteGoal };
}

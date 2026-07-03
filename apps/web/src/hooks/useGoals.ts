import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId, scopedKey } from '../lib/workspace.js';

// Goals as a first-class, project-scoped store (mirrors GoalEntity in
// packages/domain). The executive engine reasons against a primary goal; this
// lets the creator actually set/track those targets instead of a hardcoded
// "Reach 100k Subscribers" string. Supabase + offline localStorage mirror.

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

const GOALS_LS = 'pronoia_goals';
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

function loadLocal(): Goal[] {
  try { const raw = localStorage.getItem(scopedKey(GOALS_LS)); if (raw) return (JSON.parse(raw) as any[]).map(rowToGoal); } catch { /* ignore */ }
  return [];
}
function persistLocal(items: unknown[]) {
  try { localStorage.setItem(scopedKey(GOALS_LS), JSON.stringify(items)); } catch { /* ignore */ }
}

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>(() => loadLocal());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ws = getActiveWorkspaceId();
      try {
        const g = await supabase.from('goals').select('*').eq('workspace_id', ws);
        if (cancelled) return;
        if (!g.error && g.data) { setGoals(g.data.map(rowToGoal)); persistLocal(g.data); }
      } catch { /* offline → keep local */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const addGoal = useCallback((title: string, description = ''): Goal => {
    const now = new Date();
    const g: Goal = { id: uid('goal'), workspaceId: getActiveWorkspaceId(), title: title.trim() || 'New goal', description, progress: 0, status: 'active', createdAt: now, updatedAt: now };
    setGoals(prev => { const next = [...prev, g]; persistLocal(next.map(goalToRow)); return next; });
    supabase.from('goals').upsert(goalToRow(g), { onConflict: 'id' }).then(() => {}, () => {});
    return g;
  }, []);

  const updateGoal = useCallback((id: string, patch: Partial<Goal>) => {
    setGoals(prev => {
      const next = prev.map(g => g.id === id ? { ...g, ...patch, updatedAt: new Date() } : g);
      persistLocal(next.map(goalToRow));
      const updated = next.find(g => g.id === id);
      if (updated) supabase.from('goals').upsert(goalToRow(updated), { onConflict: 'id' }).then(() => {}, () => {});
      return next;
    });
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals(prev => { const next = prev.filter(g => g.id !== id); persistLocal(next.map(goalToRow)); return next; });
    supabase.from('goals').delete().eq('id', id).then(() => {}, () => {});
  }, []);

  return { goals, addGoal, updateGoal, deleteGoal };
}

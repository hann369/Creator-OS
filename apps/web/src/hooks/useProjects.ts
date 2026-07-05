import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

// Projects list backing the project gateway. Now SYNCED to Supabase (owner-scoped
// `projects` table) so other clients — notably the Telegram bot — can see the
// user's projects and route captured ideas into the right one. Still
// localStorage-first for offline/instant load; the cloud is the shared truth.

export interface ProjectItem {
  id: string;
  name: string;
  createdAt: string;
  accent?: string; // small color dot for the tile
}

const LS_KEY = 'pronoia_projects';
const ACCENTS = ['#0F5A47', '#8b5cf6', '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4'];

const DEFAULT_PROJECT: ProjectItem = {
  id: 'main-space',
  name: 'AI Agent Course',
  createdAt: new Date().toISOString(),
  accent: ACCENTS[0],
};

function load(): ProjectItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectItem[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [DEFAULT_PROJECT];
}

function persist(projects: ProjectItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(projects)); } catch { /* ignore */ }
}

function rowToProject(r: any): ProjectItem {
  return { id: r.id, name: r.name ?? 'Untitled Project', createdAt: r.created_at ?? new Date().toISOString(), accent: r.accent ?? undefined };
}
function projectToRow(p: ProjectItem) {
  return { id: p.id, name: p.name, accent: p.accent ?? null, created_at: p.createdAt, updated_at: new Date().toISOString() };
}

function upsertRemote(p: ProjectItem) {
  supabase.from('projects').upsert(projectToRow(p), { onConflict: 'id' }).then(() => {}, () => {});
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectItem[]>(() => load());

  // Reconcile with Supabase: prefer the cloud set, but backfill any local-only
  // projects (e.g. the default) so the bot can immediately see them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from('projects').select('*');
        if (cancelled || error) return;
        const remote = (data ?? []).map(rowToProject);
        const local = load();
        const remoteIds = new Set(remote.map(p => p.id));
        const missing = local.filter(p => !remoteIds.has(p.id));
        missing.forEach(upsertRemote); // backfill local-only projects to the cloud

        const merged = remote.length || missing.length
          ? [...remote, ...missing]
          : [DEFAULT_PROJECT];
        if (merged.length === 0) return;
        setProjects(merged);
        persist(merged);
      } catch { /* offline → keep local */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const createProject = useCallback((name: string): ProjectItem => {
    const trimmed = name.trim() || 'Untitled Project';
    const project: ProjectItem = {
      id: `proj-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
    };
    setProjects(prev => { const next = [...prev, project]; persist(next); return next; });
    upsertRemote(project);
    return project;
  }, []);

  const renameProject = useCallback((id: string, name: string) => {
    setProjects(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p);
      persist(next);
      const updated = next.find(p => p.id === id);
      if (updated) upsertRemote(updated);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => {
      if (prev.length <= 1) return prev; // never remove the last project
      const next = prev.filter(p => p.id !== id);
      persist(next);
      supabase.from('projects').delete().eq('id', id).then(() => {}, () => {});
      return next;
    });
  }, []);

  return { projects, createProject, renameProject, deleteProject };
}

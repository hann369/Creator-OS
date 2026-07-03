import { useState, useCallback } from 'react';

// Lightweight projects list backing the project gateway. localStorage-first
// (offline, single-user) — cloud sync + per-project data isolation are a
// deliberate follow-up. The default project keeps id 'main-space' so ALL
// existing data (cards, moodboards, graph) stays attached to it.

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

export function useProjects() {
  const [projects, setProjects] = useState<ProjectItem[]>(() => load());

  const createProject = useCallback((name: string): ProjectItem => {
    const trimmed = name.trim() || 'Untitled Project';
    const project: ProjectItem = {
      id: `proj-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
    };
    setProjects(prev => {
      const next = [...prev, project];
      persist(next);
      return next;
    });
    return project;
  }, []);

  const renameProject = useCallback((id: string, name: string) => {
    setProjects(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p);
      persist(next);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => {
      // Never remove the last project.
      if (prev.length <= 1) return prev;
      const next = prev.filter(p => p.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { projects, createProject, renameProject, deleteProject };
}

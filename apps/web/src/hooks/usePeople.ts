import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId, scopedKey } from '../lib/workspace.js';

// People as a project-scoped store: collaborators, guests, sponsors and contacts
// around the creator's work. Supabase + offline localStorage mirror, mirroring
// useGoals.

export interface Person {
  id: string;
  workspaceId: string;
  name: string;
  role: string;       // Editor, Guest, Sponsor, …
  email?: string;
  handle?: string;    // social handle
  notes: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PEOPLE_LS = 'pronoia_people';
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

function rowToPerson(r: any): Person {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    name: r.name ?? '', role: r.role ?? '',
    email: r.email ?? undefined, handle: r.handle ?? undefined,
    notes: r.notes ?? '', tags: r.tags ?? [],
    createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
    updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
  };
}
function personToRow(p: Person) {
  return {
    id: p.id, workspace_id: p.workspaceId, name: p.name, role: p.role,
    email: p.email ?? null, handle: p.handle ?? null, notes: p.notes, tags: p.tags,
    created_at: p.createdAt.toISOString(), updated_at: p.updatedAt.toISOString(),
  };
}

function loadLocal(): Person[] {
  try { const raw = localStorage.getItem(scopedKey(PEOPLE_LS)); if (raw) return (JSON.parse(raw) as any[]).map(rowToPerson); } catch { /* ignore */ }
  return [];
}
function persistLocal(items: unknown[]) {
  try { localStorage.setItem(scopedKey(PEOPLE_LS), JSON.stringify(items)); } catch { /* ignore */ }
}

export function usePeople() {
  const [people, setPeople] = useState<Person[]>(() => loadLocal());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ws = getActiveWorkspaceId();
      try {
        const r = await supabase.from('people').select('*').eq('workspace_id', ws);
        if (cancelled) return;
        if (!r.error && r.data) { setPeople(r.data.map(rowToPerson)); persistLocal(r.data); }
      } catch { /* offline → keep local */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const addPerson = useCallback((input: { name: string; role?: string }): Person => {
    const now = new Date();
    const p: Person = {
      id: uid('person'), workspaceId: getActiveWorkspaceId(),
      name: input.name.trim() || 'Unnamed', role: input.role?.trim() ?? '',
      notes: '', tags: [], createdAt: now, updatedAt: now,
    };
    setPeople(prev => { const next = [p, ...prev]; persistLocal(next.map(personToRow)); return next; });
    supabase.from('people').upsert(personToRow(p), { onConflict: 'id' }).then(() => {}, () => {});
    return p;
  }, []);

  const updatePerson = useCallback((id: string, patch: Partial<Person>) => {
    setPeople(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date() } : p);
      persistLocal(next.map(personToRow));
      const updated = next.find(p => p.id === id);
      if (updated) supabase.from('people').upsert(personToRow(updated), { onConflict: 'id' }).then(() => {}, () => {});
      return next;
    });
  }, []);

  const deletePerson = useCallback((id: string) => {
    setPeople(prev => { const next = prev.filter(p => p.id !== id); persistLocal(next.map(personToRow)); return next; });
    supabase.from('people').delete().eq('id', id).then(() => {}, () => {});
  }, []);

  return { people, addPerson, updatePerson, deletePerson };
}

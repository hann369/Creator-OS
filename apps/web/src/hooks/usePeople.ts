import { useCallback } from 'react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from '../store/collection.js';

// People as a project-scoped store: collaborators, guests, sponsors and contacts
// around the creator's work. Backed by the shared entity collection (Phase B).

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

const people = createCollection<Person>({
  table: 'people', lsKey: 'pronoia_people', idOf: (p) => p.id,
  fromRow: rowToPerson, toRow: personToRow, stampUpdatedAt: true,
});

export function usePeople() {
  const items = people.useItems();

  const addPerson = useCallback((input: { name: string; role?: string }): Person => {
    const now = new Date();
    const p: Person = {
      id: uid('person'), workspaceId: getActiveWorkspaceId(),
      name: input.name.trim() || 'Unnamed', role: input.role?.trim() ?? '',
      notes: '', tags: [], createdAt: now, updatedAt: now,
    };
    people.add(p);
    return p;
  }, []);

  const updatePerson = useCallback((id: string, patch: Partial<Person>) => people.update(id, patch), []);
  const deletePerson = useCallback((id: string) => people.remove(id), []);

  return { people: items, addPerson, updatePerson, deletePerson };
}

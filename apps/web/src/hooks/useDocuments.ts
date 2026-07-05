import { useCallback } from 'react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { createCollection } from '../store/collection.js';

// Documents as a first-class, project-scoped store (the `document` face of the
// entity spine). Backed by the shared entity collection (Roadmap Phase B) — one
// store shared by every caller.

export interface Doc {
  id: string;
  workspaceId: string;
  title: string;
  body: string;          // markdown
  tags: string[];
  linkedCardId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

function rowToDoc(r: any): Doc {
  return {
    id: r.id, workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    title: r.title ?? '', body: r.body ?? '',
    tags: r.tags ?? [], linkedCardId: r.linked_card_id ?? r.linkedCardId ?? undefined,
    createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
    updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
  };
}
function docToRow(d: Doc) {
  return {
    id: d.id, workspace_id: d.workspaceId, title: d.title, body: d.body,
    tags: d.tags, linked_card_id: d.linkedCardId ?? null,
    created_at: d.createdAt.toISOString(), updated_at: d.updatedAt.toISOString(),
  };
}

const documents = createCollection<Doc>({
  table: 'documents', lsKey: 'pronoia_documents', idOf: (d) => d.id,
  fromRow: rowToDoc, toRow: docToRow, stampUpdatedAt: true,
});

export function useDocuments() {
  const items = documents.useItems();

  const addDocument = useCallback((title: string): Doc => {
    const now = new Date();
    const d: Doc = { id: uid('doc'), workspaceId: getActiveWorkspaceId(), title: title.trim() || 'Untitled', body: '', tags: [], createdAt: now, updatedAt: now };
    documents.add(d);
    return d;
  }, []);

  const updateDocument = useCallback((id: string, patch: Partial<Doc>) => documents.update(id, patch), []);
  const deleteDocument = useCallback((id: string) => documents.remove(id), []);

  return { documents: items, addDocument, updateDocument, deleteDocument };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId, scopedKey } from '../lib/workspace.js';

// Documents as a first-class, project-scoped store (the `document` face of the
// entity spine). Long-form notes/scripts that can optionally be linked to a
// pipeline card. Supabase + offline localStorage mirror, mirroring useGoals.

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

const DOCS_LS = 'pronoia_documents';
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

function loadLocal(): Doc[] {
  try { const raw = localStorage.getItem(scopedKey(DOCS_LS)); if (raw) return (JSON.parse(raw) as any[]).map(rowToDoc); } catch { /* ignore */ }
  return [];
}
function persistLocal(items: unknown[]) {
  try { localStorage.setItem(scopedKey(DOCS_LS), JSON.stringify(items)); } catch { /* ignore */ }
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Doc[]>(() => loadLocal());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ws = getActiveWorkspaceId();
      try {
        const r = await supabase.from('documents').select('*').eq('workspace_id', ws);
        if (cancelled) return;
        if (!r.error && r.data) { setDocuments(r.data.map(rowToDoc)); persistLocal(r.data); }
      } catch { /* offline → keep local */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const addDocument = useCallback((title: string): Doc => {
    const now = new Date();
    const d: Doc = { id: uid('doc'), workspaceId: getActiveWorkspaceId(), title: title.trim() || 'Untitled', body: '', tags: [], createdAt: now, updatedAt: now };
    setDocuments(prev => { const next = [d, ...prev]; persistLocal(next.map(docToRow)); return next; });
    supabase.from('documents').upsert(docToRow(d), { onConflict: 'id' }).then(() => {}, () => {});
    return d;
  }, []);

  const updateDocument = useCallback((id: string, patch: Partial<Doc>) => {
    setDocuments(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...patch, updatedAt: new Date() } : d);
      persistLocal(next.map(docToRow));
      const updated = next.find(d => d.id === id);
      if (updated) supabase.from('documents').upsert(docToRow(updated), { onConflict: 'id' }).then(() => {}, () => {});
      return next;
    });
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setDocuments(prev => { const next = prev.filter(d => d.id !== id); persistLocal(next.map(docToRow)); return next; });
    supabase.from('documents').delete().eq('id', id).then(() => {}, () => {});
  }, []);

  return { documents, addDocument, updateDocument, deleteDocument };
}

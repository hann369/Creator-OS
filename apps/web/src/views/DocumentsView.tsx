import React, { useState } from 'react';
import { FileText, Plus, Trash2, Link as LinkIcon } from 'lucide-react';
import { useDocuments, type Doc } from '../hooks/useDocuments.js';
import { useWorkspace } from '../context/WorkspaceContext.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const inputStyle: React.CSSProperties = { fontSize: '13px', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };
const iconBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' };

const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const snippet = (body: string) => body.replace(/[#*`_>-]/g, '').trim().slice(0, 90);

export const DocumentsView: React.FC = () => {
  const { documents, addDocument, updateDocument, deleteDocument } = useDocuments();
  const { pipelineCards } = useWorkspace();
  const isMobile = useIsMobile();
  const [title, setTitle] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = documents.find(d => d.id === selectedId) ?? null;

  const submit = () => {
    if (!title.trim()) return;
    const d = addDocument(title);
    setTitle('');
    setSelectedId(d.id);
  };

  const remove = (d: Doc) => {
    deleteDocument(d.id);
    if (selectedId === d.id) setSelectedId(null);
  };

  return (
    <div className="view-body" style={{ maxWidth: '980px', margin: '0 auto', padding: '40px 24px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <FileText size={20} color="var(--accent-color)" />
        <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', margin: 0 }}>Documents</h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Langform-Notizen, Skripte und Briefings — optional an eine Pipeline-Karte gekoppelt.
      </p>

      {/* Capture */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '28px' }}>
        <input style={inputStyle} placeholder="Neues Dokument — Titel…" value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <button className="btn-sage-primary" onClick={submit} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '12px', flexShrink: 0 }}>
          <Plus size={14} /> Anlegen
        </button>
      </div>

      {documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
          Noch kein Dokument. Leg dein erstes Skript oder Briefing an.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '20px', alignItems: 'start' }}>
          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {documents.map(d => (
              <div key={d.id} onClick={() => setSelectedId(d.id)}
                style={{ padding: '12px 14px', borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--border-color)',
                  background: d.id === selectedId ? 'var(--accent-light)' : 'rgba(0,0,0,0.015)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  <button title="Löschen" onClick={(e) => { e.stopPropagation(); remove(d); }} style={{ ...iconBtn, width: '24px', height: '24px', flexShrink: 0 }}><Trash2 size={12} /></button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                  {snippet(d.body) || 'Leer'}{d.linkedCardId && <LinkIcon size={10} style={{ marginLeft: '6px', verticalAlign: 'middle' }} />}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '6px', opacity: 0.7 }}>{fmt(d.updatedAt)}</div>
              </div>
            ))}
          </div>

          {/* Editor */}
          {selected ? (
            <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '22px' }}>
              <input
                value={selected.title}
                onChange={(e) => updateDocument(selected.id, { title: e.target.value })}
                style={{ ...inputStyle, fontSize: '20px', fontWeight: 600, border: 'none', padding: '0 0 12px', borderRadius: 0, borderBottom: '1px solid var(--border-color)' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0' }}>
                <LinkIcon size={13} color="var(--text-secondary)" />
                <select value={selected.linkedCardId ?? ''} onChange={(e) => updateDocument(selected.id, { linkedCardId: e.target.value || undefined })}
                  style={{ ...inputStyle, width: 'auto', flex: 1, fontSize: '12px' }}>
                  <option value="">Keiner Pipeline-Karte zugeordnet</option>
                  {pipelineCards.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <textarea
                value={selected.body}
                onChange={(e) => updateDocument(selected.id, { body: e.target.value })}
                placeholder="Schreibe das Dokument (Markdown)…"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: '340px', border: '1px solid var(--border-color)', background: 'transparent', padding: '14px', fontSize: '13px', outline: 'none', borderRadius: '8px', fontFamily: 'var(--font-mono)', lineHeight: 1.7, resize: 'vertical' }}
              />
            </div>
          ) : (
            <div style={{ border: '1px dashed var(--border-color)', borderRadius: '14px', padding: '60px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Wähle links ein Dokument zum Bearbeiten.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

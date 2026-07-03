import React, { useState, useEffect } from 'react';
import { Plus, X, Copy, Trash2, Link as LinkIcon, Image as ImageIcon, Palette, Type } from 'lucide-react';
import { useMoodboards, BOARD_TYPES, type MoodboardStatus } from '../hooks/useMoodboards.js';
import { useRelationships } from '../hooks/useRelationships.js';
import { useBrandDna } from '../hooks/useBrandDna.js';
import { entityStore } from '../lib/entityStore.js';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import type { BoardType, Ratio } from '@pronoia/domain';
import { useWorkspace } from '../context/WorkspaceContext.js';
import { FONT_OPTIONS, loadFont, fontStack } from '../lib/fonts.js';

const STATUSES: MoodboardStatus[] = ['draft', 'active', 'archived'];
const RATIOS: Ratio[] = ['9:16', '1:1', '16:9'];
const RATIO_W: Record<Ratio, number> = { '9:16': 150, '1:1': 168, '16:9': 320 };
const RATIO_CSS: Record<Ratio, string> = { '9:16': '9 / 16', '1:1': '1 / 1', '16:9': '16 / 9' };

export const MoodboardsView: React.FC<{ activeBoardId?: string | null; onActiveBoardChange?: (id: string | null) => void }> = ({ activeBoardId, onActiveBoardChange }) => {
  const { boards, createBoard, addMoodboard, updateBoard, deleteBoard, addSection, updateSection, deleteSection, addItem, deleteItem } = useMoodboards();
  const { relationships, addRelationship, removeRelationship } = useRelationships();
  const { pipelineCards } = useWorkspace();
  const { extractBrandDna, isLoading: importing, error: importError, preview, clearPreview } = useBrandDna();

  const [localActiveId, setLocalActiveId] = useState<string | null>(boards[0]?.id ?? null);
  const [importUrl, setImportUrl] = useState('');

  const handleImport = async () => {
    try {
      await extractBrandDna(importUrl, getActiveWorkspaceId());
    } catch {
      // error is captured in hook state
    }
  };

  const confirmImport = async () => {
    if (preview) {
      // B.3 Provenance linkage
      const researchId = `res-${Date.now()}`;
      const researchEntity = {
        id: researchId,
        workspaceId: getActiveWorkspaceId(),
        type: 'research' as const,
        title: preview.title || 'Brand DNA Research',
        metadata: { sourceUrl: preview.metadata?.importedFrom || importUrl },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      try {
        await entityStore.upsert(researchEntity);
        await entityStore.link(preview.id, researchId, 'derived_from');
      } catch (err) {
        console.warn('Failed to save provenance research entity & link:', err);
      }

      addMoodboard(preview);
      setActiveId(preview.id);
      clearPreview();
      setImportUrl('');
    }
  };
  const activeId = activeBoardId !== undefined && activeBoardId !== null ? activeBoardId : localActiveId;
  const setActiveId = (id: string | null) => {
    if (onActiveBoardChange) onActiveBoardChange(id);
    setLocalActiveId(id);
  };

  const board = boards.find(b => b.id === activeId) ?? boards[0];

  // add-item form (scoped to a section)
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [itemType, setItemType] = useState<'image' | 'color' | 'text'>('image');
  const [itemRatio, setItemRatio] = useState<Ratio>('9:16');
  const [itemLabel, setItemLabel] = useState('');
  const [itemValue, setItemValue] = useState('');
  const [itemCaption, setItemCaption] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newSwatch, setNewSwatch] = useState('#E5591F');
  const [newBoardType, setNewBoardType] = useState<BoardType>('video_brand_deck');

  // Load the board's chosen fonts whenever they change.
  useEffect(() => {
    if (!board) return;
    loadFont(board.fonts.title);
    loadFont(board.fonts.subheading);
    loadFont(board.fonts.caption);
  }, [board?.fonts.title, board?.fonts.subheading, board?.fonts.caption]);

  // Keep activeId valid if it was deleted or is not set
  useEffect(() => {
    if (boards.length > 0 && (!activeId || !boards.some(b => b.id === activeId))) {
      setActiveId(boards[0].id);
    }
  }, [boards, activeId]);

  if (!board) {
    return (
      <div className="view-body" style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Noch keine Moodboards.</p>
        <button className="btn-sage-primary" style={{ padding: '10px 20px' }} onClick={() => setActiveId(createBoard('Neues Moodboard'))}>
          <Plus size={13} /> Moodboard erstellen
        </button>
      </div>
    );
  }

  const submitItem = (sectionId: string) => {
    if (itemType === 'text' && !itemLabel.trim() && !itemCaption.trim()) return;
    if (itemType === 'image' && !itemValue.trim()) return;
    addItem(board.id, sectionId, {
      kind: itemType, ratio: itemRatio,
      label: itemLabel.trim() || (itemType === 'color' ? itemValue : 'Untitled'),
      imageUrl: itemType === 'image' ? itemValue.trim() : undefined,
      color: itemType === 'color' ? (itemValue.trim() || '#E5591F') : undefined,
      caption: itemCaption.trim() || undefined
    });
    setItemLabel(''); setItemValue(''); setItemCaption(''); setAddingIn(null);
  };

  const handleAttachChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCardId = e.target.value || undefined;

    // 1. Remove any existing styled_by relationships for this board
    const existingRels = relationships.filter(r => r.sourceId === board.id && r.type === 'styled_by');
    existingRels.forEach(r => removeRelationship(r.id));

    // 2. Update the board's attachedCardId mirror field
    updateBoard(board.id, { attachedCardId: nextCardId });

    // 3. Add new relationship if a card was selected
    if (nextCardId) {
      addRelationship(board.id, nextCardId, 'styled_by');
    }
  };

  const fontDecl = (prefix: string, family: string, accent?: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
      <span style={{ fontSize: '11px', color: accent ? '#fff' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
        background: accent ? '#E5591F' : 'transparent', padding: accent ? '2px 8px' : 0, borderRadius: '99px' }}>
        {prefix} <span style={{ fontFamily: fontStack(family), fontWeight: 700 }}>{family}</span>
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', padding: '28px 40px' }}>
      {/* ─── LEFT: deck ─── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Board switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
          {boards.map(b => (
            <button key={b.id} onClick={() => setActiveId(b.id)} className="label-mono"
              style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '99px', border: '1px solid var(--border-color)', cursor: 'pointer',
                background: b.id === board.id ? 'var(--accent-light)' : 'transparent', color: b.id === board.id ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
              {b.client || b.title}
            </button>
          ))}
          <select value={newBoardType} onChange={e => setNewBoardType(e.target.value as BoardType)}
            style={{ fontSize: '10px', border: '1px solid var(--border-color)', borderRadius: '99px', padding: '4px 8px', background: 'transparent', color: 'var(--text-secondary)' }}>
            {BOARD_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
          <button className="btn-sage-secondary" style={{ fontSize: '10px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            onClick={() => setActiveId(createBoard('New Board', newBoardType))}><Plus size={11} /> New</button>
        </div>

        {/* Deck header: client + subtitle (left) · typography (right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '28px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
          <div style={{ minWidth: 0 }}>
            <input value={board.client} onChange={e => updateBoard(board.id, { client: e.target.value })}
              placeholder="Client / Project"
              style={{ fontFamily: fontStack(board.fonts.title), fontWeight: 700, fontSize: '34px', color: 'var(--text-primary)', border: 'none', background: 'transparent', outline: 'none', width: '100%', lineHeight: 1.05 }} />
            <input value={board.subtitle} onChange={e => updateBoard(board.id, { subtitle: e.target.value })}
              placeholder="What it is for (e.g. Video Brand Deck)"
              style={{ fontFamily: fontStack(board.fonts.subheading), fontWeight: 700, fontSize: '14px', color: 'var(--text-secondary)', border: 'none', background: 'transparent', outline: 'none', width: '100%', marginTop: '4px' }} />
            <textarea value={board.note} onChange={e => updateBoard(board.id, { note: e.target.value })}
              placeholder="Note (optional)…" rows={2}
              style={{ fontSize: '10px', color: 'var(--text-secondary)', border: 'none', background: 'transparent', outline: 'none', width: '100%', maxWidth: '420px', marginTop: '8px', resize: 'none', lineHeight: 1.5 }} />
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: fontStack(board.fonts.title), fontWeight: 700, fontSize: '22px', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              Titles in {board.fonts.title}
            </span>
            {fontDecl('SUB HEADINGS IN', board.fonts.subheading)}
            {fontDecl('Captions in', board.fonts.caption, true)}
          </div>
        </div>

        {/* Sections */}
        {board.sections.map(section => (
          <div key={section.id} style={{ marginBottom: '36px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <input value={section.title} onChange={e => updateSection(board.id, section.id, { title: e.target.value })}
                style={{ fontFamily: fontStack(board.fonts.subheading), fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', border: 'none', background: 'transparent', outline: 'none', letterSpacing: '0.02em' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-sage-secondary" style={{ fontSize: '10px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => { setAddingIn(section.id); setItemType('image'); setItemRatio('9:16'); }}><Plus size={11} /> Item</button>
                <button onClick={() => deleteSection(board.id, section.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.5 }}><Trash2 size={12} /></button>
              </div>
            </div>

            {/* tiles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
              {section.items.map(item => (
                <div key={item.id} className="moodboard-tile" style={{ width: `${RATIO_W[item.ratio]}px` }}>
                  <div style={{ aspectRatio: RATIO_CSS[item.ratio], borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative',
                    background: item.kind === 'color' ? item.color : item.kind === 'text' ? '#141414' : 'rgba(0,0,0,0.03)' }}>
                    {item.kind === 'image' && item.imageUrl && (
                      <img src={item.imageUrl} alt={item.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    {item.kind === 'text' && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px', textAlign: 'center' }}>
                        <span style={{ fontFamily: fontStack(board.fonts.subheading), fontWeight: 700, color: '#fff', fontSize: item.ratio === '16:9' ? '18px' : '15px', lineHeight: 1.2 }}>
                          {item.caption || item.label}
                        </span>
                      </div>
                    )}
                    {item.kind === 'color' && item.caption && (
                      <div style={{ position: 'absolute', left: 0, bottom: 0, padding: '10px 12px', fontFamily: fontStack(board.fonts.caption), fontSize: '9px', letterSpacing: '0.06em',
                        color: isDark(item.color) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)' }}>{item.caption}</div>
                    )}
                    <button onClick={() => deleteItem(board.id, section.id, item.id)} className="moodboard-tile-del"
                      style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#fff', opacity: 0, transition: 'opacity 0.15s' }}><X size={12} /></button>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* add-item form for this section */}
            {addingIn === section.id && (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', marginTop: '16px', background: 'rgba(0,0,0,0.01)', maxWidth: '460px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {([['image', ImageIcon], ['color', Palette], ['text', Type]] as const).map(([t, Icon]) => (
                    <button key={t} onClick={() => setItemType(t)} style={typePill(itemType === t)}><Icon size={12} /> {t}</button>
                  ))}
                  <select value={itemRatio} onChange={e => setItemRatio(e.target.value as Ratio)} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: '11px' }}>
                    {RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input placeholder="Label" value={itemLabel} onChange={e => setItemLabel(e.target.value)} style={inputStyle} />
                  {itemType === 'image' && <input placeholder="Bild-URL (https://…)" value={itemValue} onChange={e => setItemValue(e.target.value)} style={inputStyle} />}
                  {itemType === 'color' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="color" value={itemValue || '#E5591F'} onChange={e => setItemValue(e.target.value)} style={{ width: '40px', height: '32px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
                      <input placeholder="#HEX" value={itemValue} onChange={e => setItemValue(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    </div>
                  )}
                  <input placeholder="Caption (optional)" value={itemCaption} onChange={e => setItemCaption(e.target.value)} style={inputStyle} />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn-sage-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => setAddingIn(null)}>Abbrechen</button>
                    <button className="btn-sage-primary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => submitItem(section.id)}>Hinzufügen</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <button className="btn-sage-secondary" style={{ padding: '7px 14px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          onClick={() => addSection(board.id, 'New Section')}><Plus size={12} /> Add Section</button>
      </div>

      {/* ─── RIGHT: details panel ─── */}
      <aside style={{ width: '320px', flexShrink: 0, position: 'sticky', top: '24px', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
        border: '1px solid var(--border-color)', borderRadius: '14px', padding: '22px', background: '#fff' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Moodboard Details</span>

        {/* Brand DNA Import */}
        <div style={{ marginTop: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '6px' }}>BRAND DNA IMPORT</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              placeholder="https://brand.com" 
              value={importUrl} 
              onChange={e => setImportUrl(e.target.value)} 
              disabled={importing}
              style={{ ...inputStyle, flex: 1 }} 
            />
            <button 
              className="btn-sage-primary" 
              style={{ padding: '6px 12px', fontSize: '11px', flexShrink: 0 }} 
              disabled={importing || !importUrl.trim()}
              onClick={handleImport}
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
          {importError && (
            <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '6px' }}>{importError}</div>
          )}
          {preview && (
            <div style={{ background: 'var(--accent-light)', border: '1px dashed var(--accent-color)', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
              <div className="label-mono" style={{ fontSize: '9px', color: 'var(--accent-color)', marginBottom: '4px' }}>DRAFT PREVIEW</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.client}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.subtitle}</div>
              
              {/* Palette Preview */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                {preview.palette.map((c, idx) => (
                  <span key={idx} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c.hex, border: '1px solid rgba(0,0,0,0.1)' }} title={c.hex} />
                ))}
              </div>
              
              {/* Fonts Preview */}
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
                Fonts: {preview.fonts.title} / {preview.fonts.subheading}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                <button 
                  className="btn-sage-secondary" 
                  style={{ padding: '4px 10px', fontSize: '10px' }} 
                  onClick={clearPreview}
                >
                  Cancel
                </button>
                <button 
                  className="btn-sage-primary" 
                  style={{ padding: '4px 10px', fontSize: '10px' }} 
                  onClick={confirmImport}
                >
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: '18px' }} />
        <Section label="TYPE">
          <select value={board.boardType} onChange={e => updateBoard(board.id, { boardType: e.target.value as BoardType })} style={inputStyle}>
            {BOARD_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </Section>
        <Section label="CLIENT / PROJECT">
          <input value={board.client} onChange={e => updateBoard(board.id, { client: e.target.value })} style={inputStyle} />
        </Section>
        <Section label="SUBTITLE">
          <input value={board.subtitle} onChange={e => updateBoard(board.id, { subtitle: e.target.value })} style={inputStyle} />
        </Section>

        <Section label="TYPOGRAPHY">
          <datalist id="mb-fonts">{FONT_OPTIONS.map(f => <option key={f} value={f} />)}</datalist>
          {([['title', 'Titles'], ['subheading', 'Sub-headings'], ['caption', 'Captions']] as const).map(([k, lbl]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', width: '78px', flexShrink: 0 }}>{lbl}</span>
              <input list="mb-fonts" value={board.fonts[k]} onChange={e => { loadFont(e.target.value); updateBoard(board.id, { fonts: { ...board.fonts, [k]: e.target.value } }); }}
                style={{ ...inputStyle, fontFamily: fontStack(board.fonts[k]) }} />
            </div>
          ))}
        </Section>

        <Section label="DESCRIPTION">
          <textarea value={board.description} onChange={e => updateBoard(board.id, { description: e.target.value })} style={{ ...inputStyle, minHeight: '56px', resize: 'vertical', lineHeight: 1.5 }} />
        </Section>

        <Section label="TAGS">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {board.tags.map(t => (
              <span key={t} className="inline-entity-tag" style={{ padding: '3px 8px', borderRadius: '99px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {t}<X size={9} style={{ cursor: 'pointer' }} onClick={() => updateBoard(board.id, { tags: board.tags.filter(x => x !== t) })} />
              </span>
            ))}
          </div>
          <input placeholder="+ Tag, Enter" value={newTag} onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { updateBoard(board.id, { tags: [...board.tags, newTag.trim()] }); setNewTag(''); } }} style={inputStyle} />
        </Section>

        <Section label="COLOR PALETTE">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {board.palette.map((c, i) => (
              <span key={i} title={c.hex} onClick={() => updateBoard(board.id, { palette: board.palette.filter((_, j) => j !== i) })}
                style={{ width: '22px', height: '22px', borderRadius: '50%', background: c.hex, border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer' }} />
            ))}
            <input type="color" value={newSwatch} onChange={e => setNewSwatch(e.target.value)} style={{ width: '24px', height: '24px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} />
            <button className="btn-sage-secondary" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => updateBoard(board.id, { palette: [...board.palette, { hex: newSwatch }] })}>Add</button>
          </div>
        </Section>

        <Section label="ATTACHED TO">
          <select id="mb-attach" value={board.attachedCardId ?? ''} onChange={handleAttachChange} style={inputStyle}>
            <option value="">— nicht verknüpft —</option>
            {pipelineCards.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Section>

        <Section label="STATUS">
          <select value={board.status} onChange={e => updateBoard(board.id, { status: e.target.value as MoodboardStatus })} style={inputStyle}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Section>

        <Section label="NOTES">
          <textarea value={board.notes} onChange={e => updateBoard(board.id, { notes: e.target.value })} placeholder="Notizen…" style={{ ...inputStyle, minHeight: '56px', resize: 'vertical', lineHeight: 1.5 }} />
        </Section>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '6px' }}>
          <div className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '10px' }}>QUICK ACTIONS</div>
          <QuickAction icon={<Copy size={13} />} label="Duplicate" onClick={() => {
            const id = createBoard(`${board.client} (Copy)`, board.boardType);
            updateBoard(id, { subtitle: board.subtitle, note: board.note, description: board.description, tags: board.tags, palette: board.palette, fonts: board.fonts, sections: board.sections, notes: board.notes });
            setActiveId(id);
          }} />
          <QuickAction icon={<LinkIcon size={13} />} label="Link to Pipeline Card" onClick={() => document.getElementById('mb-attach')?.focus()} />
          <QuickAction icon={<Trash2 size={13} />} label="Delete" danger onClick={() => { deleteBoard(board.id); setActiveId(boards.find(b => b.id !== board.id)?.id ?? null); }} />
        </div>
      </aside>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: '12px', border: '1px solid var(--border-color)', padding: '7px 10px',
  borderRadius: '6px', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)'
};
const typePill = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
  border: '1px solid var(--border-color)', textTransform: 'capitalize',
  background: active ? 'var(--accent-light)' : 'transparent', color: active ? 'var(--accent-color)' : 'var(--text-secondary)'
});

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: '16px' }}>
    <div className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.08em' }}>{label}</div>
    {children}
  </div>
);

const QuickAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <div onClick={onClick} className="command-palette-item"
    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: danger ? '#b91c1c' : 'var(--text-primary)' }}
    onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(185,28,28,0.06)' : 'var(--accent-light)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
    {icon} {label}
  </div>
);

function isDark(hex?: string) {
  if (!hex) return true;
  const h = hex.replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

export default MoodboardsView;

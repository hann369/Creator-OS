import React, { useState } from 'react';
import { Play, TrendingUp, Plus, X, AlignLeft, Trash2, Youtube, Twitter, Instagram, CheckSquare, Paperclip, Copy, Target, Braces, Share2, Network, Palette, Download, Eye } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.js';
import { useRelationships } from '../hooks/useRelationships.js';
import { useMoodboards } from '../hooks/useMoodboards.js';
import { useSocialIngest, type SocialPlatform } from '../hooks/useSocialIngest.js';
import { useIdentity } from '../hooks/useIdentity.js';
import { useAuth } from '../context/AuthContext.js';
import { displayName } from '../lib/user.js';
import type { PipelineStatus, ContentMetrics } from '@pronoia/domain';
import { selectNode } from '../store/selection.js';
import { COMPOSER_BRICKS, composerOptions, masterChecklistItems, type CardBricks } from '../lib/legoBricks.js';

const STAGES: { status: PipelineStatus; label: string; color: string; bg: string }[] = [
  { status: 'idea',       label: 'Idee',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  { status: 'research',   label: 'Research',    color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  { status: 'outline',    label: 'Outline',     color: '#06b6d4', bg: 'rgba(6,182,212,0.08)' },
  { status: 'script',     label: 'Script',      color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  { status: 'production', label: 'Produktion',  color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  { status: 'published',  label: 'Published',   color: '#10b981', bg: 'rgba(16,185,129,0.08)' }
];

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  youtube:   <Youtube size={12} />,
  x:         <Twitter size={12} />,
  instagram: <Instagram size={12} />
};

interface ContentPipelineViewProps {
  onOpenEditor: (id: string, name: string) => void;
  onOpenMoodboard: (id: string) => void;
}

export const ContentPipelineView: React.FC<ContentPipelineViewProps> = ({ onOpenEditor, onOpenMoodboard }) => {
  const {
    pipelineCards,
    nodes,
    edges,
    createCard,
    updateCard,
    deleteCard,
    duplicateCard,
    promoteCardToNode,
    cardNodeId,
    addActivityLog
  } = useWorkspace();

  const { relationships } = useRelationships();
  const { boards } = useMoodboards();
  const { identities, activeIdentity } = useIdentity();
  const { user } = useAuth();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [mdOverCardId, setMdOverCardId] = useState<string | null>(null);

  // Right-click context menu (desk actions)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; cardId: string } | null>(null);

  // Sub-section tabs inside the workspace panel
  const [activeSideTab, setActiveSideTab] = useState<'content' | 'bricks' | 'checklists' | 'sources' | 'graph' | 'comments' | 'metrics'>('content');

  const EMPTY_METRICS = { views: 0, watchTimeMinutes: 0, avgViewDurationSeconds: 0, clickThroughRate: 0, likes: 0, comments: 0, shares: 0, subscriberGain: 0, viralScore: 0 };
  const updateMetric = (cardId: string, field: 'views' | 'viralScore' | 'clickThroughRate' | 'subscriberGain', value: number) => {
    const card = pipelineCards.find(c => c.id === cardId);
    const base = card?.metrics ?? EMPTY_METRICS;
    updateCard(cardId, { metrics: { ...base, [field]: value } });
  };

  // Input states for new items
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  const selectedItem = pipelineCards.find(i => i.id === selectedItemId);

  const linkedMoodboardRel = relationships.find(r => r.targetId === selectedItem?.id && r.type === 'styled_by');
  const linkedMoodboard = boards.find(b =>
    b.id === linkedMoodboardRel?.sourceId || b.attachedCardId === selectedItem?.id
  );

  // ─── See → Do: close the identity learning loop ─────────────────────────────
  // The identity that styles this card (via its linked moodboard), else the
  // project's active one. Its hooks are re-ranked by real performance, so the
  // top ones are the data-driven default for the next piece. Only suggest while
  // the hook is still empty — never overwrite what the user wrote.
  const styledByIdentity = linkedMoodboard
    ? identities.find(i => i.moodboardIds.includes(linkedMoodboard.id)) ?? activeIdentity
    : activeIdentity;
  const hookSuggestions = !selectedItem?.hook?.trim() && styledByIdentity
    ? styledByIdentity.hooks.slice(0, 3)
    : [];

  // ─── Graph linkage for the open card (single source of truth) ──────────────
  const cardMirrorId = selectedItem ? cardNodeId(selectedItem.id) : null;
  const linkedNodes = cardMirrorId
    ? edges
        .filter(e => e.sourceId === cardMirrorId || e.targetId === cardMirrorId)
        .map(e => {
          const otherId = e.sourceId === cardMirrorId ? e.targetId : e.sourceId;
          return { edge: e, node: nodes.find(n => n.id === otherId) };
        })
        .filter((x): x is { edge: typeof x.edge; node: NonNullable<typeof x.node> } => !!x.node)
    : [];

  // ─── Drag & Drop handlers ──────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (e.shiftKey) {
      e.preventDefault();
      duplicateCard(id);
      addActivityLog('Duplicated card via Shift+Drag shortcut');
    } else {
      setDraggedItemId(id);
      e.dataTransfer.setData('text/plain', id);
    }
  };

  const handleDragOver = (e: React.DragEvent, status: PipelineStatus) => {
    e.preventDefault();
    setDragOverColId(status);
  };

  const handleDrop = (e: React.DragEvent, status: PipelineStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedItemId;
    if (id) updateCard(id, { status });
    setDraggedItemId(null);
    setDragOverColId(null);
  };

  // ─── Markdown file → card (drag a .md onto a card to import its content) ─────
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types || []).includes('Files');

  const handleCardFileDragOver = (e: React.DragEvent, cardId: string) => {
    if (!isFileDrag(e)) return;            // internal card-move DnD → let it bubble
    e.preventDefault();
    e.stopPropagation();
    setMdOverCardId(cardId);
  };

  const handleCardFileDragLeave = (e: React.DragEvent, cardId: string) => {
    if (!isFileDrag(e)) return;
    if (mdOverCardId === cardId) setMdOverCardId(null);
  };

  const handleCardFileDrop = async (e: React.DragEvent, cardId: string) => {
    if (!isFileDrag(e)) return;            // not a file → column handler moves the card
    e.preventDefault();
    e.stopPropagation();
    setMdOverCardId(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.(md|markdown|mdx|txt)$/i.test(file.name)) {
      addActivityLog(`Ignored non-markdown drop: ${file.name}`);
      return;
    }
    try {
      const text = await file.text();
      const card = pipelineCards.find(c => c.id === cardId);
      const heading = text.match(/^\s*#\s+(.+)$/m);
      const patch: { markdown: string; title?: string } = { markdown: text };
      // Adopt the file's H1 as the title only if the card is still an untouched draft.
      if (heading && (!card?.title || card.title === 'Neuer Entwurf')) {
        patch.title = heading[1].trim();
      }
      updateCard(cardId, patch);
      setSelectedItemId(cardId);
      setActiveSideTab('content');
      addActivityLog(`Imported ${file.name} → card`);
    } catch {
      addActivityLog(`Failed to read ${file.name}`);
    }
  };

  // Checklist actions
  const handleToggleCheck = (cardId: string, checkId: string, done: boolean) => {
    const card = pipelineCards.find(c => c.id === cardId);
    if (!card || !card.checklists) return;
    const updatedChecks = card.checklists.map(chk => chk.id === checkId ? { ...chk, done } : chk);
    updateCard(cardId, { checklists: updatedChecks });
  };

  const handleAddChecklist = (cardId: string) => {
    if (!newChecklistText.trim()) return;
    const card = pipelineCards.find(c => c.id === cardId);
    if (!card) return;
    const currentChecks = card.checklists || [];
    const newCheck = { id: `chk-${crypto.randomUUID().slice(0, 8)}`, text: newChecklistText.trim(), done: false };
    updateCard(cardId, { checklists: [...currentChecks, newCheck] });
    setNewChecklistText('');
  };

  // Attachment actions
  const handleAddAttachment = (cardId: string) => {
    if (!newAttachmentName.trim()) return;
    const card = pipelineCards.find(c => c.id === cardId);
    if (!card) return;
    const currentAtts = card.attachments || [];
    const newAtt = {
      id: `att-${crypto.randomUUID().slice(0, 8)}`,
      name: newAttachmentName.trim(),
      type: newAttachmentUrl.trim() ? 'url' : 'pdf',
      url: newAttachmentUrl.trim() || undefined
    };
    updateCard(cardId, { attachments: [...currentAtts, newAtt] });
    setNewAttachmentName('');
    setNewAttachmentUrl('');
  };

  // Comment actions
  const handleAddComment = (cardId: string) => {
    if (!newCommentText.trim()) return;
    const card = pipelineCards.find(c => c.id === cardId);
    if (!card) return;
    const currentComments = card.comments || [];
    const newComment = {
      id: `com-${crypto.randomUUID().slice(0, 8)}`,
      author: displayName(user),
      text: newCommentText.trim(),
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    updateCard(cardId, { comments: [...currentComments, newComment] });
    setNewCommentText('');
  };

  const handleExportMarkdown = (card: typeof pipelineCards[number]) => {
    const title = card.title || 'Draft';
    const hookText = card.hook ? `> **Hook:** ${card.hook}\n\n` : '';
    const bodyText = card.markdown || '';
    const markdownContent = `# ${title}\n\n${hookText}${bodyText}`;

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeFilename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'script';

    link.href = url;
    link.setAttribute('download', `${safeFilename}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addActivityLog(`Exported script "${title}" as ${safeFilename}.md`);
  };

  // Context menu actions
  const runCtx = (fn: () => void) => { fn(); setCtxMenu(null); };

  return (
    <div className="view-body" style={{ maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* ─── LEFT: the board (always visible) ─── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: '32px' }}>
            <span className="label-mono">Workspace Pipeline</span>
            <h1 className="title-serif" style={{ fontSize: '36px', color: 'var(--text-primary)', marginTop: '4px' }}>
              Physical Desk
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              Click a card to open its workspace • Right-click for actions • Drag to move • Shift+Drag to duplicate.
            </p>
          </div>

          <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: selectedItem ? 'repeat(6, minmax(150px, 1fr))' : 'repeat(6, 1fr)',
              gap: '16px',
              alignItems: 'start',
              minWidth: selectedItem ? '920px' : 'auto'
            }}>
              {STAGES.map((stage) => {
                const stageItems = pipelineCards.filter(i => i.status === stage.status);
                const isOver = dragOverColId === stage.status;

                return (
                  <div
                    key={stage.status}
                    onDragOver={(e) => handleDragOver(e, stage.status)}
                    onDrop={(e) => handleDrop(e, stage.status)}
                    className={isOver ? 'kanban-col-dragover' : ''}
                    style={{
                      background: 'rgba(0,0,0,0.012)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px',
                      border: '1px solid var(--border-color)',
                      minHeight: '65vh',
                      transition: 'background 0.3s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span className="label-mono" style={{ fontSize: '10px', fontWeight: 700, color: stage.color }}>{stage.label}</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{stageItems.length}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {stageItems.map((item, cardIdx) => {
                        const rotClass = cardIdx % 2 === 0 ? 'rot-left' : 'rot-right';
                        const isDragging = draggedItemId === item.id;
                        const isActive = selectedItemId === item.id;
                        const isMdOver = mdOverCardId === item.id;
                        const completedChecks = item.checklists?.filter(c => c.done).length || 0;
                        const totalChecks = item.checklists?.length || 0;

                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, item.id)}
                            onDragOver={(e) => handleCardFileDragOver(e, item.id)}
                            onDragLeave={(e) => handleCardFileDragLeave(e, item.id)}
                            onDrop={(e) => handleCardFileDrop(e, item.id)}
                            onClick={() => setSelectedItemId(item.id)}
                            onDoubleClick={() => onOpenEditor(item.id, item.title)}
                            onContextMenu={(e) => { e.preventDefault(); setSelectedItemId(item.id); setCtxMenu({ x: e.clientX, y: e.clientY, cardId: item.id }); }}
                            className={`physical-note-card ${rotClass} ${isDragging ? 'kanban-card-dragging' : ''}`}
                            style={{
                              padding: '14px', cursor: 'grab', outlineOffset: '2px',
                              outline: isMdOver ? '2px dashed var(--accent-color)' : isActive ? '2px solid var(--accent-color)' : 'none',
                              background: isMdOver ? 'var(--accent-light)' : undefined,
                            }}
                            title="Click to open • Double-click fullscreen • Right-click actions • Drop a .md file to import"
                          >
                            <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.4' }}>
                              {item.title}
                            </div>

                            {item.hook && (
                              <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)', marginTop: '6px', fontStyle: 'italic', lineHeight: '1.4' }}>
                                "{item.hook}"
                              </div>
                            )}

                            {totalChecks > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
                                <CheckSquare size={9} />
                                <span>{completedChecks}/{totalChecks} Tasks</span>
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {item.platforms.map(plat => (
                                <span key={plat} style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-secondary)' }}>
                                  {PLATFORM_ICONS[plat]}
                                </span>
                              ))}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', fontFamily: 'var(--font-mono)', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                              <span style={{ color: 'var(--accent-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <TrendingUp size={9} /> {item.trendScore?.toFixed(1) || '0.0'}
                              </span>
                              {item.executivePriority && (
                                <span style={{ background: 'var(--accent-light)', padding: '1px 4px', borderRadius: '3px', fontWeight: 600, color: 'var(--accent-color)' }}>
                                  P={item.executivePriority.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      className="btn-sage-secondary"
                      onClick={() => createCard('Neuer Entwurf', stage.status)}
                      style={{ width: '100%', marginTop: '14px', padding: '5px 0', fontSize: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3px' }}
                    >
                      <Plus size={10} /> Add Note
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── RIGHT: inline card workspace (split view desk) ─── */}
        {selectedItem && (
          <div
            className="pipeline-workspace-panel"
            style={{
              width: '480px',
              flexShrink: 0,
              alignSelf: 'flex-start',
              position: 'sticky',
              top: '24px',
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
              background: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.06)'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="label-mono">card workspace</span>
                <button onClick={() => setSelectedItemId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>

              <div>
                <input
                  type="text"
                  className="title-serif"
                  value={selectedItem.title}
                  onChange={(e) => updateCard(selectedItem.id, { title: e.target.value })}
                  style={{ fontSize: '26px', color: 'var(--text-primary)', border: 'none', background: 'transparent', outline: 'none', width: '100%', marginBottom: '8px' }}
                />
                <span className="label-mono" style={{ fontSize: '10px' }}>{selectedItem.status.toUpperCase()} • {selectedItem.format} • {linkedNodes.length} linked</span>
              </div>

              {/* Sub Tabs Navigation */}
              <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', fontSize: '11px', fontWeight: 600, flexWrap: 'wrap' }}>
                <span onClick={() => setActiveSideTab('content')} style={{ cursor: 'pointer', color: activeSideTab === 'content' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>Document</span>
                <span onClick={() => setActiveSideTab('bricks')} style={{ cursor: 'pointer', color: activeSideTab === 'bricks' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>Bricks ({Object.values(selectedItem.bricks ?? {}).filter(Boolean).length})</span>
                <span onClick={() => setActiveSideTab('checklists')} style={{ cursor: 'pointer', color: activeSideTab === 'checklists' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>Checklist ({selectedItem.checklists?.length || 0})</span>
                <span onClick={() => setActiveSideTab('sources')} style={{ cursor: 'pointer', color: activeSideTab === 'sources' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>Research ({selectedItem.attachments?.length || 0})</span>
                <span onClick={() => setActiveSideTab('graph')} style={{ cursor: 'pointer', color: activeSideTab === 'graph' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>Graph ({linkedNodes.length})</span>
                <span onClick={() => setActiveSideTab('comments')} style={{ cursor: 'pointer', color: activeSideTab === 'comments' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>AI</span>
                <span onClick={() => setActiveSideTab('metrics')} style={{ cursor: 'pointer', color: activeSideTab === 'metrics' ? 'var(--accent-color)' : 'var(--text-secondary)' }}>Metrics</span>
              </div>

              {/* Content details */}
              {activeSideTab === 'content' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1, overflowY: 'auto' }}>
                  <div>
                    <h4 style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      <AlignLeft size={13} /> Hook
                    </h4>
                    <textarea
                      value={selectedItem.hook || ''}
                      onChange={(e) => updateCard(selectedItem.id, { hook: e.target.value })}
                      placeholder="Brief hook or subtitle..."
                      style={{ width: '100%', border: 'none', background: 'rgba(0,0,0,0.02)', padding: '10px', fontSize: '12px', resize: 'none', outline: 'none', borderRadius: '4px', height: '60px', fontFamily: 'var(--font-sans)', lineHeight: '1.6' }}
                    />
                    {hookSuggestions.length > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <div className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '6px' }}>
                          AUS DEINER BRAND IDENTITY · NACH PERFORMANCE GERANKT
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {hookSuggestions.map((h, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => updateCard(selectedItem.id, { hook: h })}
                              className="command-palette-item"
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', width: '100%', fontSize: '12px', color: 'var(--text-primary)', padding: '8px 10px', background: 'rgba(15,90,71,0.04)', border: '1px solid rgba(15,90,71,0.06)', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              <span style={{ fontSize: '10px', color: 'var(--accent-color)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{i + 1}</span>
                              {h}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {linkedMoodboard && (
                    <div>
                      <h4 style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        <Palette size={13} color="var(--accent-color)" /> Style Reference
                      </h4>
                      <div 
                        onClick={() => onOpenMoodboard(linkedMoodboard.id)}
                        className="command-palette-item"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '10px 12px', 
                          background: 'var(--accent-light)', 
                          border: '1px solid rgba(15,90,71,0.06)', 
                          borderRadius: '6px', 
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>{linkedMoodboard.client}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>— {linkedMoodboard.title}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>open board →</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Document</h4>
                      <button
                        className="btn-sage-secondary"
                        onClick={() => handleExportMarkdown(selectedItem)}
                        style={{ padding: '4px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                        title="Als Markdown-Datei (.md) exportieren"
                      >
                        <Download size={11} /> Export .md
                      </button>
                    </div>
                    <textarea
                      value={selectedItem.markdown || ''}
                      onChange={(e) => updateCard(selectedItem.id, { markdown: e.target.value })}
                      placeholder="Write the document body..."
                      style={{ width: '100%', border: '1px solid var(--border-color)', background: 'transparent', padding: '10px', fontSize: '12px', outline: 'none', borderRadius: '4px', height: '200px', fontFamily: 'var(--font-mono)', lineHeight: '1.6', resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}

              {/* Checklists */}
              {activeSideTab === 'checklists' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Task hinzufügen..."
                      value={newChecklistText}
                      onChange={e => setNewChecklistText(e.target.value)}
                      style={{ flexGrow: 1, fontSize: '12px', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '4px', outline: 'none', background: 'transparent' }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddChecklist(selectedItem.id)}
                    />
                    <button className="btn-sage-primary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => handleAddChecklist(selectedItem.id)}>Add</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedItem.checklists?.map(chk => (
                      <label key={chk.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', padding: '6px', background: 'rgba(0,0,0,0.01)', borderRadius: '4px' }}>
                        <input type="checkbox" checked={chk.done} onChange={(e) => handleToggleCheck(selectedItem.id, chk.id, e.target.checked)} />
                        <span style={{ textDecoration: chk.done ? 'line-through' : 'none', color: chk.done ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{chk.text}</span>
                      </label>
                    )) || <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>Keine Tasks vorhanden.</div>}
                  </div>
                </div>
              )}

              {/* Bricks — compose the video from the Lego Bricks */}
              {activeSideTab === 'bricks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, overflowY: 'auto' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Stelle das Video aus den Bausteinen zusammen. Format setzt auch das <code>format</code>-Feld der Karte.
                  </div>
                  {COMPOSER_BRICKS.map((cb) => {
                    const value = (selectedItem.bricks ?? {})[cb.key] ?? '';
                    return (
                      <div key={cb.key}>
                        <div className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '0.06em', marginBottom: '4px' }}>{cb.label}</div>
                        <select
                          value={value}
                          onChange={(e) => {
                            const next: CardBricks = { ...(selectedItem.bricks ?? {}), [cb.key]: e.target.value || undefined };
                            const patch: Record<string, unknown> = { bricks: next };
                            // Format is a first-class card field too — keep them in sync.
                            if (cb.key === 'format' && e.target.value) patch.format = e.target.value;
                            updateCard(selectedItem.id, patch);
                          }}
                          style={{ width: '100%', fontSize: '12px', border: '1px solid var(--border-color)', padding: '7px 10px', borderRadius: '6px', outline: 'none', background: 'transparent' }}
                        >
                          <option value="">— wählen —</option>
                          {composerOptions(cb).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  <button
                    className="btn-sage-secondary"
                    style={{ padding: '8px 12px', fontSize: '11px', marginTop: '4px' }}
                    onClick={() => {
                      const existing = selectedItem.checklists ?? [];
                      const items = masterChecklistItems().filter((m) => !existing.some((e) => e.id === m.id));
                      if (items.length === 0) { setActiveSideTab('checklists'); return; }
                      updateCard(selectedItem.id, { checklists: [...existing, ...items] });
                      setActiveSideTab('checklists');
                    }}
                    title="Die 6-Stufen Master-Checklist als Tasks anhängen"
                  >
                    + Master-Checklist laden
                  </button>
                </div>
              )}

              {/* Sources / Research */}
              {activeSideTab === 'sources' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.01)', padding: '12px', borderRadius: '6px' }}>
                    <input type="text" placeholder="Name (z.B. Transcript.pdf)" value={newAttachmentName} onChange={e => setNewAttachmentName(e.target.value)} style={{ fontSize: '12px', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '4px', outline: 'none', background: 'transparent' }} />
                    <input type="text" placeholder="URL (optional)" value={newAttachmentUrl} onChange={e => setNewAttachmentUrl(e.target.value)} style={{ fontSize: '12px', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '4px', outline: 'none', background: 'transparent' }} />
                    <button className="btn-sage-primary" style={{ padding: '6px 12px', fontSize: '11px', alignSelf: 'flex-end' }} onClick={() => handleAddAttachment(selectedItem.id)}>Attach Source</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedItem.attachments?.map(att => (
                      <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: '4px', fontSize: '11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Paperclip size={10} color="var(--accent-color)" />
                          <span>{att.name}</span>
                          {att.url && <a href={att.url} target="_blank" rel="noreferrer" style={{ fontSize: '9px', color: 'var(--accent-color)' }}>Link</a>}
                        </div>
                        <span style={{ fontSize: '9px', textTransform: 'uppercase', background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '3px' }}>{att.type}</span>
                      </div>
                    )) || <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>Keine Anhänge verknüpft.</div>}
                  </div>
                </div>
              )}

              {/* Graph — linked knowledge nodes (single source of truth) */}
              {activeSideTab === 'graph' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, overflowY: 'auto' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Diese Karte lebt als Knoten im Wissensgraph. Verknüpfte Konzepte & Ziele:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {linkedNodes.length > 0 ? linkedNodes.map(({ edge, node }) => (
                      <div key={edge.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '8px 12px', background: 'rgba(15,90,71,0.04)', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Network size={11} color="var(--accent-color)" />
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{node.label}</span>
                          <button
                            title="Im Brain anzeigen"
                            onClick={() => selectNode(node.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--accent-color)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              padding: '2px',
                              marginLeft: '4px',
                            }}
                          >
                            <Eye size={12} />
                          </button>
                        </div>
                        <span style={{ fontSize: '9px', color: 'var(--accent-color)', fontFamily: 'var(--font-mono)' }}>{edge.type}</span>
                      </div>
                    )) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>
                        Noch nicht verknüpft. Nutze Rechtsklick → "Convert to Goal/Concept".
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button className="btn-sage-secondary" style={{ flex: 1, padding: '8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => promoteCardToNode(selectedItem.id, 'goal')}>
                      <Target size={12} /> to Goal
                    </button>
                    <button className="btn-sage-secondary" style={{ flex: 1, padding: '8px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => promoteCardToNode(selectedItem.id, 'concept')}>
                      <Braces size={12} /> to Concept
                    </button>
                  </div>
                </div>
              )}

              {/* AI / Brain comments */}
              {activeSideTab === 'comments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" placeholder="Schreibe einen Kommentar..." value={newCommentText} onChange={e => setNewCommentText(e.target.value)} style={{ flexGrow: 1, fontSize: '12px', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '4px', outline: 'none', background: 'transparent' }} onKeyDown={(e) => e.key === 'Enter' && handleAddComment(selectedItem.id)} />
                    <button className="btn-sage-primary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => handleAddComment(selectedItem.id)}>Add</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedItem.comments?.map(com => (
                      <div key={com.id} style={{ padding: '8px 12px', background: 'rgba(15, 90, 71, 0.04)', borderRadius: '6px', fontSize: '11.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600, fontSize: '10px', color: 'var(--accent-color)' }}>
                          <span>{com.author}</span>
                          <span>{com.createdAt}</span>
                        </div>
                        <p style={{ color: 'var(--text-primary)', margin: 0 }}>{com.text}</p>
                      </div>
                    )) || <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>Keine Kommentare erfasst.</div>}
                  </div>
                </div>
              )}

              {/* Performance metrics — editing these fires the identity learning loop */}
              {activeSideTab === 'metrics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, overflowY: 'auto' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Post-publish performance. Editing these re-ranks this brand's identity hooks by what performs (via the moodboard this card is styled by).
                  </p>
                  {([
                    ['viralScore', 'Viral Score (0–10)', 0.1],
                    ['clickThroughRate', 'Click-Through Rate (0–1)', 0.01],
                    ['subscriberGain', 'Subscribers Gained', 1],
                    ['views', 'Views', 1],
                  ] as const).map(([field, label, step]) => (
                    <div key={field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{label}</span>
                      <input
                        type="number"
                        step={step}
                        value={(selectedItem.metrics?.[field] as number) ?? 0}
                        onChange={e => updateMetric(selectedItem.id, field, parseFloat(e.target.value) || 0)}
                        style={{ width: '110px', fontSize: '12px', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '4px', outline: 'none', background: 'transparent', textAlign: 'right' }}
                      />
                    </div>
                  ))}

                  <SocialIngestBlock
                    onApply={(metrics) => updateCard(selectedItem.id, { metrics })}
                  />
                </div>
              )}

              {/* Platforms + fullscreen + delete */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  {selectedItem.platforms.map(plat => (
                    <span key={plat} className="inline-entity-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '99px' }}>
                      {PLATFORM_ICONS[plat]} <span style={{ textTransform: 'capitalize' }}>{plat}</span>
                    </span>
                  ))}
                </div>
                <button className="btn-sage-primary" onClick={() => onOpenEditor(selectedItem.id, selectedItem.title)} style={{ width: '100%', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  <Play size={12} fill="white" /> Open Fullscreen Focus
                </button>
                <button className="btn-sage-secondary" onClick={() => handleExportMarkdown(selectedItem)} style={{ width: '100%', padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <Download size={12} /> Export .md File
                </button>
                <button className="btn-sage-secondary" onClick={() => { deleteCard(selectedItem.id); setSelectedItemId(null); }} style={{ width: '100%', border: '1px solid #fda4af', color: '#b91c1c', background: 'transparent', padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <Trash2 size={12} /> Archive Draft
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── RIGHT-CLICK CONTEXT MENU ─── */}
      {ctxMenu && (
        <>
          <div onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1400 }} />
          <div style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 1401, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '6px', minWidth: '190px' }}>
            {[
              { icon: <AlignLeft size={13} />, label: 'Open workspace', fn: () => setSelectedItemId(ctxMenu.cardId) },
              { icon: <Copy size={13} />, label: 'Duplicate', fn: () => duplicateCard(ctxMenu.cardId) },
              { icon: <Download size={13} />, label: 'Export as .md', fn: () => {
                  const card = pipelineCards.find(c => c.id === ctxMenu.cardId);
                  if (card) handleExportMarkdown(card);
                } 
              },
              { icon: <Target size={13} />, label: 'Convert to Goal', fn: () => promoteCardToNode(ctxMenu.cardId, 'goal') },
              { icon: <Braces size={13} />, label: 'Convert to Concept', fn: () => promoteCardToNode(ctxMenu.cardId, 'concept') },
              { icon: <Share2 size={13} />, label: 'Convert to Research', fn: () => promoteCardToNode(ctxMenu.cardId, 'insight') }
            ].map((it, i) => (
              <div key={i} onClick={() => runCtx(it.fn)} className="command-palette-item" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-primary)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-light)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                {it.icon} {it.label}
              </div>
            ))}
            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 6px' }} />
            <div onClick={() => runCtx(() => { deleteCard(ctxMenu.cardId); if (selectedItemId === ctxMenu.cardId) setSelectedItemId(null); })} className="command-palette-item" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#b91c1c' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(185,28,28,0.06)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <Trash2 size={13} /> Archive
            </div>
          </div>
        </>
      )}

    </div>
  );
};
export default ContentPipelineView;

// ─── Auto-pull performance from a platform (credential-free scaffold) ─────────
// Enter a video/media id → the server pulls metrics and maps them to
// ContentMetrics (which fires the identity learning loop). Without server API
// keys the endpoint returns 501 and we show a "connect your account" hint.
const SocialIngestBlock: React.FC<{ onApply: (metrics: ContentMetrics) => void }> = ({ onApply }) => {
  const { ingest, loading, error, needsCredentials } = useSocialIngest();
  const [platform, setPlatform] = useState<SocialPlatform>('youtube');
  const [postId, setPostId] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const pull = async () => {
    if (!postId.trim()) return;
    setDone(null);
    const res = await ingest(platform, postId.trim());
    if (res) { onApply(res.metrics); setDone(res.post.title ? `Gezogen: ${res.post.title}` : 'Metriken übernommen.'); }
  };

  const inputStyle: React.CSSProperties = { fontSize: '12px', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '4px', outline: 'none', background: 'transparent' };

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '8px', paddingTop: '14px' }}>
      <div className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '8px' }}>AUTO-PULL FROM PLATFORM</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select value={platform} onChange={e => setPlatform(e.target.value as SocialPlatform)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
        </select>
        <input value={postId} onChange={e => setPostId(e.target.value)} placeholder={platform === 'youtube' ? 'Video-ID' : 'Media-ID'}
          onKeyDown={e => { if (e.key === 'Enter') pull(); }} style={{ ...inputStyle, flexGrow: 1, minWidth: 0 }} />
        <button className="btn-sage-secondary" onClick={pull} disabled={loading} style={{ padding: '6px 12px', fontSize: '11px', whiteSpace: 'nowrap', opacity: loading ? 0.6 : 1 }}>
          {loading ? '…' : 'Pull'}
        </button>
      </div>
      {needsCredentials && (
        <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
          Noch kein {needsCredentials === 'youtube' ? 'YouTube' : 'Instagram'}-Zugang verbunden. Setze {needsCredentials === 'youtube' ? 'YOUTUBE_API_KEY' : 'INSTAGRAM_ACCESS_TOKEN'} serverseitig, um automatisch zu ziehen.
        </p>
      )}
      {error && <p style={{ fontSize: '10px', color: '#c0392b', marginTop: '8px' }}>{error}</p>}
      {done && <p style={{ fontSize: '10px', color: 'var(--accent-color)', marginTop: '8px' }}>{done}</p>}
    </div>
  );
};

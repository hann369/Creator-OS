import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Plus, GripVertical, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.js';
import { actOnSelection, aiConfigured, type InlineAction } from '../lib/reasoning.js';

interface Block {
  id: string;
  type: 'heading' | 'text' | 'checklist' | 'decision' | 'citation' | 'ai-insight' | 'code' | 'callout';
  content: string;
  checked?: boolean;
}

interface EditorViewProps {
  cardId: string;
}

export const EditorView: React.FC<EditorViewProps> = ({ cardId }) => {
  const { pipelineCards, nodes, edges, updateCard } = useWorkspace();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null);
  const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<InlineAction | null>(null);
  
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isUpdatingRef = useRef(false);

  // Find the card from WorkspaceContext
  const activeCard = pipelineCards.find(c => c.id === cardId);

  // 1. Deserialization: Parse Markdown string into Block[] on mount or card change
  useEffect(() => {
    if (!activeCard) return;
    
    // Prevent infinite loop from local updates
    if (isUpdatingRef.current) {
      isUpdatingRef.current = false;
      return;
    }

    const md = activeCard.markdown || '';
    if (!md.trim()) {
      setBlocks([
        { id: 'b1', type: 'heading', content: activeCard.title },
        { id: 'b2', type: 'text', content: 'Beginnen Sie hier zu schreiben...' }
      ]);
      return;
    }

    const parsedBlocks: Block[] = [];
    const lines = md.split('\n');
    let codeContent: string[] = [];
    let isCodeMode = false;

    lines.forEach((line, index) => {
      // Code block parsing
      if (line.startsWith('```')) {
        if (isCodeMode) {
          parsedBlocks.push({
            id: `b-code-${index}`,
            type: 'code',
            content: codeContent.join('\n')
          });
          codeContent = [];
          isCodeMode = false;
        } else {
          isCodeMode = true;
        }
        return;
      }

      if (isCodeMode) {
        codeContent.push(line);
        return;
      }

      const trimmed = line.trim();
      if (!trimmed) return;

      if (line.startsWith('# ')) {
        parsedBlocks.push({ id: `b-${index}`, type: 'heading', content: line.substring(2) });
      } else if (line.startsWith('- [x] ')) {
        parsedBlocks.push({ id: `b-${index}`, type: 'checklist', content: line.substring(6), checked: true });
      } else if (line.startsWith('- [ ] ')) {
        parsedBlocks.push({ id: `b-${index}`, type: 'checklist', content: line.substring(6), checked: false });
      } else if (line.startsWith('✦ ')) {
        parsedBlocks.push({ id: `b-${index}`, type: 'ai-insight', content: line.substring(2) });
      } else if (line.startsWith('◆ ')) {
        parsedBlocks.push({ id: `b-${index}`, type: 'decision', content: line.substring(2) });
      } else if (line.startsWith('> ')) {
        parsedBlocks.push({ id: `b-${index}`, type: 'callout', content: line.substring(2) });
      } else if (line.startsWith('○ ')) {
        parsedBlocks.push({ id: `b-${index}`, type: 'citation', content: line.substring(2) });
      } else {
        parsedBlocks.push({ id: `b-${index}`, type: 'text', content: line });
      }
    });

    if (parsedBlocks.length === 0) {
      parsedBlocks.push({ id: 'b-init', type: 'text', content: md });
    }

    setBlocks(parsedBlocks);
  }, [cardId, activeCard?.id]);

  // 2. Serialization: Convert Block[] back into Markdown string on block updates
  const serializeAndSave = (updatedBlocks: Block[]) => {
    if (!activeCard) return;

    const serializedLines = updatedBlocks.map(block => {
      switch (block.type) {
        case 'heading': return `# ${block.content}`;
        case 'checklist': return `- [${block.checked ? 'x' : ' '}] ${block.content}`;
        case 'ai-insight': return `✦ ${block.content}`;
        case 'decision': return `◆ ${block.content}`;
        case 'callout': return `> ${block.content}`;
        case 'citation': return `○ ${block.content}`;
        case 'code': return `\`\`\`\n${block.content}\n\`\`\``;
        default: return block.content;
      }
    });

    const markdownString = serializedLines.join('\n\n');
    isUpdatingRef.current = true;
    updateCard(cardId, { markdown: markdownString });
  };

  // ─── Floating Text Selection Listener ──────────────────────────────────────
  useEffect(() => {
    const handleSelectionChange = () => {
      // Selections inside <textarea>/<input> are handled by onSelect (below),
      // since they don't appear in window.getSelection(). Don't clear here.
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setTooltipPosition(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setTooltipPosition(null);
        return;
      }

      setSelectedText(text);

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 45 + window.scrollY
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  // Selection inside an editable textarea → show the AI action tooltip above it.
  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>, index: number) => {
    const ta = e.currentTarget;
    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
    if (!sel) {
      if (!aiBusy) setTooltipPosition(null);
      return;
    }
    setSelectedText(sel);
    setActiveBlockIndex(index);
    const rect = ta.getBoundingClientRect();
    setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top - 45 + window.scrollY });
  };

  const updateBlockContent = (id: string, value: string) => {
    const updated = blocks.map(b => b.id === id ? { ...b, content: value } : b);
    setBlocks(updated);
    serializeAndSave(updated);

    // Slash command trigger check
    if (value.endsWith('/')) {
      setSlashMenuBlockId(id);
    } else {
      setSlashMenuBlockId(null);
    }
  };

  const toggleChecklist = (id: string) => {
    const updated = blocks.map(b => b.id === id ? { ...b, checked: !b.checked } : b);
    setBlocks(updated);
    serializeAndSave(updated);
  };

  const deleteBlock = (id: string) => {
    const updated = blocks.filter(b => b.id !== id);
    setBlocks(updated);
    serializeAndSave(updated);
  };

  const changeBlockType = (id: string, type: Block['type']) => {
    const updated = blocks.map(b => b.id === id ? { ...b, type } : b);
    setBlocks(updated);
    serializeAndSave(updated);
  };

  const addBlockBelow = (index: number, type: Block['type'] = 'text') => {
    const newBlock: Block = {
      id: `b-${Date.now()}`,
      type,
      content: '',
      checked: false
    };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    serializeAndSave(newBlocks);
  };

  // The selection actions reason over the graph — no canned text. Each inserts
  // a block whose type matches the action (expand→insight, challenge→callout,
  // evidence→citation).
  const handleAIAction = async (action: InlineAction) => {
    if (!selectedText || activeBlockIndex === null || aiBusy) return;

    const insertAt = activeBlockIndex;
    const text = selectedText;
    window.getSelection()?.removeAllRanges();
    setTooltipPosition(null);

    if (!aiConfigured()) {
      const warn: Block = { id: `b-${Date.now()}`, type: 'callout', content: 'Kein Mistral API Key konfiguriert (VITE_MISTRAL_API_KEY).' };
      const nb = [...blocks]; nb.splice(insertAt + 1, 0, warn); setBlocks(nb); serializeAndSave(nb);
      return;
    }

    setAiBusy(action);
    try {
      const output = await actOnSelection(action, text, { nodes, edges, cards: pipelineCards });
      const blockType: Block['type'] = action === 'challenge' ? 'callout' : action === 'evidence' ? 'citation' : 'ai-insight';
      const newBlock: Block = { id: `b-${Date.now()}`, type: blockType, content: output };
      const newBlocks = [...blocks];
      newBlocks.splice(insertAt + 1, 0, newBlock);
      setBlocks(newBlocks);
      serializeAndSave(newBlocks);
    } catch (err) {
      const errBlock: Block = { id: `b-${Date.now()}`, type: 'callout', content: `Reasoning fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
      const nb = [...blocks]; nb.splice(insertAt + 1, 0, errBlock); setBlocks(nb); serializeAndSave(nb);
    } finally {
      setAiBusy(null);
    }
  };

  // ─── Ebene 2: Margin Intelligence Alert parser ───
  const getMarginAlerts = (content: string): string[] => {
    const text = content.toLowerCase();
    const alerts: string[] = [];
    if (text.includes('agent') || text.includes('workspace')) {
      alerts.push('Trend +17 %');
      alerts.push('4 Papers');
      alerts.push('Goal Alignment 91 %');
    }
    if (text.includes('mcp') || text.includes('cql')) {
      alerts.push('Similar draft exists');
      alerts.push('Goal Alignment 84 %');
    }
    if (text.includes('sync') || text.includes('crdt') || text.includes('latency')) {
      alerts.push('Contradiction found');
      alerts.push('CRDT latency conflicts with Time');
    }
    return alerts;
  };

  // ─── Inline Entity tag parser ───
  const getSemanticTokens = (content: string) => {
    const tokens = [];
    const text = content.toLowerCase();
    if (text.includes('agent') || text.includes('workspace')) {
      tokens.push({ label: 'Concept', symbol: '○' });
    }
    if (text.includes('subscribers') || text.includes('subs')) {
      tokens.push({ label: 'Goal', symbol: '◎' });
    }
    if (text.includes('mcp')) {
      tokens.push({ label: 'Tech', symbol: '◇' });
    }
    return tokens;
  };

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={editorRef}>
      {/* Floating text selection menu */}
      {tooltipPosition && (
        <div
          className="floating-ai-tooltip"
          style={{
            top: `${tooltipPosition.y}px`,
            left: `${tooltipPosition.x}px`,
            transform: 'translateX(-50%)'
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Sparkles size={12} color="#10b981" />
          {aiBusy ? (
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '0 8px' }}>
              denkt… ({aiBusy})
            </span>
          ) : (
            <>
              <button className="floating-ai-btn" onClick={() => handleAIAction('expand')}>Expand</button>
              <button className="floating-ai-btn" onClick={() => handleAIAction('challenge')}>Challenge</button>
              <button className="floating-ai-btn" onClick={() => handleAIAction('evidence')}>Find Evidence</button>
            </>
          )}
        </div>
      )}

      {/* Block List */}
      <div className="block-editor-container" style={{ position: 'relative' }}>
        {blocks.map((block, index) => {
          const marginAlerts = block.type === 'text' || block.type === 'heading'
            ? getMarginAlerts(block.content)
            : [];
          
          const semanticTokens = block.type === 'text' || block.type === 'heading'
            ? getSemanticTokens(block.content)
            : [];

          return (
            <div className="editor-block-wrapper" key={block.id} style={{ position: 'relative' }}>
              <div
                className="editor-block"
                onFocus={() => setActiveBlockIndex(index)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  minHeight: '38px',
                  paddingLeft: '28px'
                }}
              >
                {/* Drag handle */}
                <div className="editor-block-handle" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <GripVertical size={14} />
                  <select
                    value={block.type}
                    onChange={(e) => changeBlockType(block.id, e.target.value as any)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '9px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    <option value="text">Paragraph</option>
                    <option value="heading">Heading</option>
                    <option value="checklist">Task</option>
                    <option value="decision">Decision</option>
                    <option value="citation">Citation</option>
                    <option value="ai-insight">AI Insight</option>
                    <option value="code">Code</option>
                    <option value="callout">Callout</option>
                  </select>
                </div>

                {/* Left side block decorations */}
                <div style={{ flexShrink: 0, marginTop: block.type === 'heading' ? '12px' : '6px' }}>
                  {block.type === 'checklist' && (
                    <span 
                      className={`custom-checkbox-circle ${block.checked ? 'checked' : ''}`}
                      onClick={() => toggleChecklist(block.id)}
                    />
                  )}
                </div>

                {/* Inline inputs */}
                <div style={{ flexGrow: 1, position: 'relative' }}>
                  {block.type === 'heading' ? (
                    <input
                      type="text"
                      className="editor-block-heading"
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      placeholder="Title"
                    />
                  ) : block.type === 'code' ? (
                    <textarea
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      onSelect={(e) => handleTextareaSelect(e, index)}
                      placeholder="// code block..."
                      rows={2}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'rgba(0,0,0,0.02)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        outline: 'none',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        resize: 'none'
                      }}
                    />
                  ) : block.type === 'ai-insight' ? (
                    <div className="ai-insight-block-text">
                      ✦ {block.content}
                    </div>
                  ) : block.type === 'decision' ? (
                    <div className="decision-block-text">
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-color)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>Decision</div>
                      {block.content}
                    </div>
                  ) : block.type === 'callout' ? (
                    <div style={{ borderLeft: '2px solid #ef4444', paddingLeft: '14px', color: '#B42318', fontStyle: 'italic', fontSize: '13px' }}>
                      {block.content}
                    </div>
                  ) : block.type === 'citation' ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--accent-color)' }}>○</span> <span>{block.content}</span>
                    </div>
                  ) : (
                    <textarea
                      className="editor-block-text"
                      value={block.content}
                      onChange={(e) => updateBlockContent(block.id, e.target.value)}
                      onSelect={(e) => handleTextareaSelect(e, index)}
                      placeholder="Write your thoughts..."
                      rows={Math.max(1, Math.ceil(block.content.length / 85))}
                    />
                  )}

                  {/* ─── INLINE FLOATING SLASH MENU ─── */}
                  {slashMenuBlockId === block.id && (
                    <div 
                      className="command-palette-window" 
                      style={{ 
                        position: 'absolute', 
                        top: '100%', 
                        left: 0, 
                        zIndex: 1000, 
                        maxWidth: '220px', 
                        padding: '6px', 
                        boxShadow: 'var(--shadow-lg)', 
                        background: 'white', 
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px'
                      }}
                    >
                      {([
                        { type: 'heading', label: 'Heading' },
                        { type: 'text', label: 'Paragraph' },
                        { type: 'checklist', label: 'Task List' },
                        { type: 'decision', label: 'Decision' },
                        { type: 'citation', label: 'Citation' },
                        { type: 'code', label: 'Code Block' }
                      ] as const).map(opt => (
                        <div 
                          key={opt.type} 
                          onClick={() => {
                            // Strip slash and change block type
                            const cleanContent = block.content.endsWith('/') ? block.content.slice(0, -1) : block.content;
                            updateBlockContent(block.id, cleanContent);
                            changeBlockType(block.id, opt.type);
                            setSlashMenuBlockId(null);
                          }}
                          style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '4px' }}
                          className="command-palette-item"
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-light)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {opt.label}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Render semantic tokens at the bottom-right of the block */}
                  {semanticTokens.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', justifyContent: 'flex-end' }}>
                      {semanticTokens.map(tok => (
                        <span className="inline-entity-tag" key={tok.label}>
                          {tok.symbol} {tok.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Trash delete action */}
                <button
                  onClick={() => deleteBlock(block.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    opacity: 0.1,
                    cursor: 'pointer',
                    transition: 'opacity 0.2s ease',
                    marginTop: '4px'
                  }}
                  className="block-delete-btn"
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.1')}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Ebene 2: Margin Intelligence (Fades in right next to the paragraph) */}
              {marginAlerts.length > 0 && (
                <div className="margin-intelligence-note">
                  {marginAlerts.map((alert, idx) => (
                    <div key={idx} style={{ marginBottom: '4px' }}>
                      <span className="margin-bullet">✦</span>
                      <span>{alert}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ paddingLeft: '28px', marginTop: '24px' }}>
          <button
            className="btn-sage-secondary"
            style={{ padding: '6px 16px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={() => addBlockBelow(blocks.length - 1)}
          >
            <Plus size={12} /> Add Block
          </button>
        </div>
      </div>
    </div>
  );
};
export default EditorView;

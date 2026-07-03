import React, { useState } from 'react';
import { Star, Plus, Trash2, Instagram, Youtube, ExternalLink, ArrowRight, Archive, Target, Zap } from 'lucide-react';
import { useIdeation, IDEA_STATUSES, type IdeaStatus, type Idea } from '../hooks/useIdeation.js';
import { useWorkspace } from '../context/WorkspaceContext.js';

const STATUS_COLOR: Record<IdeaStatus, string> = {
  'Idea': '#8b5cf6', 'Draft': '#6b7280', 'Ready To Record': '#3b82f6',
  'Editing': '#ef4444', 'Ready To Post': '#a855f7', 'Posted': '#10b981',
};

const Stars: React.FC<{ value: number; onChange: (n: number) => void; size?: number }> = ({ value, onChange, size = 14 }) => (
  <span style={{ display: 'inline-flex', gap: '2px' }}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} size={size} onClick={() => onChange(n === value ? 0 : n)} style={{ cursor: 'pointer' }}
        fill={n <= value ? '#f59e0b' : 'none'} color={n <= value ? '#f59e0b' : 'var(--text-secondary)'} />
    ))}
  </span>
);

const inputStyle: React.CSSProperties = { fontSize: '12px', border: '1px solid var(--border-color)', padding: '7px 10px', borderRadius: '6px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };

const Callout: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      {icon}
      <h2 className="title-serif" style={{ fontSize: '22px', color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
    </div>
    <div style={{ borderTop: '1px solid var(--border-color)', margin: '12px 0 16px' }} />
    {children}
  </div>
);

export const IdeationView: React.FC = () => {
  const { creators, ideas, addCreator, updateCreator, deleteCreator, addIdea, updateIdea, deleteIdea } = useIdeation();
  const { createCard, addActivityLog } = useWorkspace();

  const [crName, setCrName] = useState('');
  const [crIg, setCrIg] = useState('');
  const [crYt, setCrYt] = useState('');
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaFilter, setIdeaFilter] = useState<'all' | 'unrated' | 'archive'>('all');
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null);

  const submitCreator = () => { if (!crName.trim()) return; addCreator(crName, crIg.trim() || undefined, crYt.trim() || undefined); setCrName(''); setCrIg(''); setCrYt(''); };
  const submitIdea = () => { if (!ideaTitle.trim()) return; const i = addIdea(ideaTitle); setIdeaTitle(''); setOpenIdeaId(i.id); };

  const promote = (idea: Idea) => {
    const cardId = createCard(idea.title, 'idea');
    updateIdea(idea.id, { status: 'Draft', promotedCardId: cardId });
    addActivityLog(`Promoted idea → Pipeline: ${idea.title}`);
  };

  const shownCreators = showFavsOnly ? creators.filter(c => c.favorite) : creators;
  const shownIdeas = ideas
    .filter(i => ideaFilter === 'archive' ? i.archived : !i.archived)
    .filter(i => ideaFilter === 'unrated' ? i.rating === 0 : true)
    .sort((a, b) => b.rating - a.rating || b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="view-body" style={{ padding: '28px 40px' }}>
      <div style={{ marginBottom: '20px' }}>
        <span className="label-mono">Front of the funnel</span>
        <h1 className="title-serif" style={{ fontSize: '36px', color: 'var(--text-primary)', marginTop: '4px' }}>Ideation Portal</h1>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ─── HITLIST ─── */}
        <Callout icon={<Target size={16} color="var(--accent-color)" />} title="Hitlist">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            <input placeholder="Creator name" value={crName} onChange={e => setCrName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitCreator()} style={inputStyle} />
            <div style={{ display: 'flex', gap: '6px' }}>
              <input placeholder="Instagram URL" value={crIg} onChange={e => setCrIg(e.target.value)} style={inputStyle} />
              <input placeholder="YouTube URL" value={crYt} onChange={e => setCrYt(e.target.value)} style={inputStyle} />
            </div>
            <button className="btn-sage-primary" style={{ padding: '7px', fontSize: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }} onClick={submitCreator}><Plus size={12} /> Add to hitlist</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{shownCreators.length} creators</span>
            <button onClick={() => setShowFavsOnly(v => !v)} className="label-mono" style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '99px', border: '1px solid var(--border-color)', cursor: 'pointer', background: showFavsOnly ? 'var(--accent-light)' : 'transparent', color: showFavsOnly ? 'var(--accent-color)' : 'var(--text-secondary)' }}>★ Favorites</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {shownCreators.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '12px', textAlign: 'center' }}>No creators yet.</div>}
            {shownCreators.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <Star size={14} onClick={() => updateCreator(c.id, { favorite: !c.favorite })} style={{ cursor: 'pointer', flexShrink: 0 }} fill={c.favorite ? '#f59e0b' : 'none'} color={c.favorite ? '#f59e0b' : 'var(--text-secondary)'} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c.instagramUrl && <a href={c.instagramUrl} target="_blank" rel="noreferrer" title="Instagram"><Instagram size={13} color="var(--text-secondary)" /></a>}
                {c.youtubeUrl && <a href={c.youtubeUrl} target="_blank" rel="noreferrer" title="YouTube"><Youtube size={13} color="var(--text-secondary)" /></a>}
                <Trash2 size={12} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={() => deleteCreator(c.id)} />
              </div>
            ))}
          </div>
        </Callout>

        {/* ─── IDEA BANK ─── */}
        <Callout icon={<Zap size={16} color="var(--accent-color)" />} title="Idea Bank">
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            <input placeholder="Capture an idea…" value={ideaTitle} onChange={e => setIdeaTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitIdea()} style={inputStyle} />
            <button className="btn-sage-primary" style={{ padding: '7px 12px', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }} onClick={submitIdea}><Plus size={12} /> Add</button>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {(['all', 'unrated', 'archive'] as const).map(f => (
              <button key={f} onClick={() => setIdeaFilter(f)} className="label-mono" style={{ fontSize: '9px', padding: '3px 10px', borderRadius: '99px', border: '1px solid var(--border-color)', cursor: 'pointer', textTransform: 'capitalize', background: ideaFilter === f ? 'var(--accent-light)' : 'transparent', color: ideaFilter === f ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{f}</button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shownIdeas.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '12px', textAlign: 'center' }}>No ideas in this view.</div>}
            {shownIdeas.map(idea => {
              const open = openIdeaId === idea.id;
              const creator = creators.find(c => c.id === idea.creatorId);
              return (
                <div key={idea.id} style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span onClick={() => setOpenIdeaId(open ? null : idea.id)} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, cursor: 'pointer' }}>{idea.title}</span>
                    <span style={{ fontSize: '8px', fontWeight: 700, color: STATUS_COLOR[idea.status], border: `1px solid ${STATUS_COLOR[idea.status]}`, borderRadius: '99px', padding: '2px 7px', whiteSpace: 'nowrap' }}>{idea.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                    <Stars value={idea.rating} onChange={n => updateIdea(idea.id, { rating: n })} />
                    {creator && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>via {creator.name}</span>}
                  </div>

                  {open && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select value={idea.status} onChange={e => updateIdea(idea.id, { status: e.target.value as IdeaStatus })} style={{ ...inputStyle, flex: 1 }}>
                          {IDEA_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={idea.creatorId ?? ''} onChange={e => updateIdea(idea.id, { creatorId: e.target.value || undefined })} style={{ ...inputStyle, flex: 1 }}>
                          <option value="">— no creator —</option>
                          {creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <input placeholder="Link to inspiration" value={idea.inspirationUrl ?? ''} onChange={e => updateIdea(idea.id, { inspirationUrl: e.target.value })} style={inputStyle} />
                      <textarea placeholder="Pain points…" value={idea.painPoints ?? ''} onChange={e => updateIdea(idea.id, { painPoints: e.target.value })} style={{ ...inputStyle, minHeight: '48px', resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
                      <textarea placeholder="Packaging questions…" value={idea.packagingQuestions ?? ''} onChange={e => updateIdea(idea.id, { packagingQuestions: e.target.value })} style={{ ...inputStyle, minHeight: '48px', resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button className="btn-sage-primary" style={{ padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' }} onClick={() => promote(idea)} disabled={!!idea.promotedCardId} title={idea.promotedCardId ? 'Already in the pipeline' : 'Create a pipeline card from this idea'}>
                          <ArrowRight size={12} /> {idea.promotedCardId ? 'In Pipeline' : 'Promote to Pipeline'}
                        </button>
                        {idea.inspirationUrl && <a href={idea.inspirationUrl} target="_blank" rel="noreferrer" className="btn-sage-secondary" style={{ padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><ExternalLink size={12} /></a>}
                        <button className="btn-sage-secondary" style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => updateIdea(idea.id, { archived: !idea.archived })} title={idea.archived ? 'Unarchive' : 'Archive'}><Archive size={12} /></button>
                        <button className="btn-sage-secondary" style={{ padding: '6px 10px', fontSize: '11px', color: '#b91c1c', borderColor: '#fda4af' }} onClick={() => { deleteIdea(idea.id); setOpenIdeaId(null); }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Callout>
      </div>
    </div>
  );
};

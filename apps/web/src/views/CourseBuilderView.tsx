import React, { useEffect, useRef, useState } from 'react';
import {
  GraduationCap, Plus, Trash2, ChevronLeft, ChevronUp, ChevronDown, Upload,
  Image as ImageIcon, Video, FileText, Code2, Type, Heading, Minus, Megaphone, Globe, Eye, EyeOff,
  ExternalLink, Copy, Check,
} from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useCourses } from '../hooks/useCourses.js';
import { useCourseContent } from '../hooks/useCourseContent.js';
import { useCourseSales } from '../hooks/useCourseSales.js';
import { uploadCourseMedia, signedMediaUrl } from '../lib/media.js';
import { type Course, type Block, type BlockType, isMediaBlock } from '../lib/courseTypes.js';

const inputStyle: React.CSSProperties = { fontSize: '13px', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };
const iconBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 };

const euros = (cents: number) => (cents / 100).toFixed(2);

// ═══════════════════════════════════════════════════════════════════════════
// Course Maker (Phase 1). Two modes: a course LIST, and the per-course BUILDER
// (settings + chapters/pages tree + block editor). Public sharing & payment are
// Phase 2/3 — a published course already carries a slug here.
// ═══════════════════════════════════════════════════════════════════════════
export const CourseBuilderView: React.FC = () => {
  const { courses, addCourse, updateCourse, deleteCourse, publishCourse, unpublishCourse } = useCourses();
  const [title, setTitle] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const open = courses.find(c => c.id === openId) ?? null;

  if (open) {
    return (
      <CourseEditor
        course={open}
        onBack={() => setOpenId(null)}
        updateCourse={updateCourse}
        deleteCourse={(id) => { deleteCourse(id); setOpenId(null); }}
        publishCourse={publishCourse}
        unpublishCourse={unpublishCourse}
      />
    );
  }

  const submit = () => { const c = addCourse(title || 'Untitled course'); setTitle(''); setOpenId(c.id); };

  return (
    <div className="view-body" style={{ maxWidth: '980px', margin: '0 auto', padding: '40px 24px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <GraduationCap size={20} color="var(--accent-color)" />
        <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', margin: 0 }}>Course Maker</h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Baue Kurse aus Kapiteln, Seiten und Blöcken — Video, PDF, Text, Embeds. Später teil- und verkaufbar als eigene Seite.
      </p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '28px' }}>
        <input style={inputStyle} placeholder="Neuer Kurs — Titel…" value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <button className="btn-sage-primary" onClick={submit} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '12px', flexShrink: 0 }}>
          <Plus size={14} /> Kurs anlegen
        </button>
      </div>

      {courses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
          Noch kein Kurs. Leg deinen ersten an.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {courses.map(c => (
            <div key={c.id} onClick={() => setOpenId(c.id)}
              style={{ padding: '18px', borderRadius: '14px', cursor: 'pointer', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.015)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.title}</span>
                <StatusBadge status={c.status} />
              </div>
              {c.subtitle && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>{c.subtitle}</div>}
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '14px' }}>
                {c.priceCents > 0 ? `${euros(c.priceCents)} ${c.currency.toUpperCase()}` : 'Kostenlos'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: Course['status'] }> = ({ status }) => {
  const map: Record<Course['status'], { bg: string; fg: string; label: string }> = {
    draft: { bg: 'rgba(0,0,0,0.05)', fg: 'var(--text-secondary)', label: 'Entwurf' },
    published: { bg: 'var(--accent-light)', fg: 'var(--accent-color)', label: 'Live' },
    archived: { bg: 'rgba(0,0,0,0.04)', fg: 'var(--text-secondary)', label: 'Archiv' },
  };
  const s = map[status];
  return <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', padding: '3px 7px', borderRadius: '99px', background: s.bg, color: s.fg, flexShrink: 0 }}>{s.label.toUpperCase()}</span>;
};

// Creator ledger for one course — appears once the course has buyers.
const SalesPanel: React.FC<{ courseId: string; currency: string }> = ({ courseId, currency }) => {
  const { buyers, netCents, loading } = useCourseSales(courseId);
  if (loading || (buyers === 0 && netCents === 0)) return null;
  return (
    <div style={{ display: 'flex', gap: '18px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
      <span>{buyers} {buyers === 1 ? 'Käufer' : 'Käufer'}</span>
      <span>Umsatz (netto): <span style={{ color: 'var(--accent-color)' }}>{(netCents / 100).toFixed(2)} {currency.toUpperCase()}</span></span>
    </div>
  );
};

// ─── Per-course builder ───────────────────────────────────────────────────────
interface EditorProps {
  course: Course;
  onBack: () => void;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  deleteCourse: (id: string) => void;
  publishCourse: (c: Course) => string;
  unpublishCourse: (id: string) => void;
}

const CourseEditor: React.FC<EditorProps> = ({ course, onBack, updateCourse, deleteCourse, publishCourse, unpublishCourse }) => {
  const isMobile = useIsMobile();
  const content = useCourseContent(course.id);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const activePage = content.pages.find(p => p.id === activePageId) ?? null;
  const orderedChapters = [...content.chapters].sort((a, b) => a.position - b.position);

  // Absolute, shareable URL — set once the course has a slug (i.e. after publish).
  const publicUrl = course.slug ? `${window.location.origin}/c/${course.slug}` : '';
  const isLive = course.status === 'published';

  const handleCopy = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  return (
    <div className="view-body" style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 120px' }}>
      {/* Header / settings */}
      <button onClick={onBack} className="btn-sage-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '11px', marginBottom: '20px' }}>
        <ChevronLeft size={13} /> Alle Kurse
      </button>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <input value={course.title} onChange={(e) => updateCourse(course.id, { title: e.target.value })}
            style={{ ...inputStyle, fontSize: '26px', fontWeight: 700, border: 'none', padding: 0 }} />
          <input value={course.subtitle} placeholder="Untertitel / kurze Beschreibung…" onChange={(e) => updateCourse(course.id, { subtitle: e.target.value })}
            style={{ ...inputStyle, fontSize: '13px', color: 'var(--text-secondary)', border: 'none', padding: '4px 0 0' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <StatusBadge status={course.status} />
          {isLive ? (
            <button className="btn-sage-secondary" onClick={() => unpublishCourse(course.id)} style={{ padding: '8px 14px', fontSize: '12px' }}>Zurückziehen</button>
          ) : (
            <button className="btn-sage-primary" onClick={() => publishCourse(course)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '12px' }}>
              <Globe size={13} /> Veröffentlichen
            </button>
          )}
          <button title="Kurs löschen" onClick={() => { if (confirm('Diesen Kurs und alle Inhalte löschen?')) deleteCourse(course.id); }} style={iconBtn}><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Live banner — makes a successful publish unmistakable + shareable. */}
      {isLive && publicUrl && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', background: 'var(--accent-light)', border: '1px solid rgba(15,90,71,0.12)', margin: '8px 0 20px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 600, color: 'var(--accent-color)' }}>
            <Globe size={15} /> Kurs ist live
          </span>
          <a href={publicUrl} target="_blank" rel="noreferrer" style={{ flex: '1 1 240px', minWidth: 0, fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            {publicUrl}
          </a>
          <button onClick={handleCopy} className="btn-sage-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px' }}>
            {copied ? <><Check size={13} /> Kopiert</> : <><Copy size={13} /> Link kopieren</>}
          </button>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-sage-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px', textDecoration: 'none' }}>
            <ExternalLink size={13} /> Ansehen
          </a>
        </div>
      )}

      {/* Price + hint */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center', padding: '14px 0 22px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
          PREIS
          <input type="number" min={0} step="0.01" value={euros(course.priceCents)}
            onChange={(e) => updateCourse(course.id, { priceCents: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)) })}
            style={{ ...inputStyle, width: '110px', padding: '6px 10px' }} />
          <select value={course.currency} onChange={(e) => updateCourse(course.id, { currency: e.target.value })} style={{ ...inputStyle, width: 'auto', padding: '6px 8px' }}>
            <option value="eur">EUR</option><option value="usd">USD</option><option value="gbp">GBP</option>
          </select>
          <span style={{ opacity: 0.6 }}>{course.priceCents === 0 ? '· kostenlos' : ''}</span>
        </label>
        {!isLive && (
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Noch nicht veröffentlicht — klick <span style={{ color: 'var(--accent-color)' }}>Veröffentlichen</span>, um eine öffentliche Kurs-Seite zu erzeugen.
          </div>
        )}
        <SalesPanel courseId={course.id} currency={course.currency} />
      </div>

      {/* Structure + blocks */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Chapters / pages tree */}
        <div>
          <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '12px' }}>STRUKTUR</div>
          {orderedChapters.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.7, marginBottom: '12px' }}>Noch kein Kapitel.</div>
          )}
          {orderedChapters.map(ch => {
            const chapterPages = content.pages.filter(p => p.chapterId === ch.id).sort((a, b) => a.position - b.position);
            return (
              <div key={ch.id} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <input value={ch.title} onChange={(e) => content.updateChapter(ch.id, { title: e.target.value })}
                    style={{ ...inputStyle, fontSize: '13px', fontWeight: 600, border: 'none', padding: '2px 0' }} />
                  <button title="Kapitel löschen" onClick={() => content.deleteChapter(ch.id)} style={{ ...iconBtn, width: '22px', height: '22px' }}><Trash2 size={11} /></button>
                </div>
                {chapterPages.map(p => (
                  <div key={p.id} onClick={() => setActivePageId(p.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', padding: '6px 10px', marginLeft: '8px', borderRadius: '7px', cursor: 'pointer',
                      background: p.id === activePageId ? 'var(--accent-light)' : 'transparent', color: p.id === activePageId ? 'var(--accent-color)' : 'var(--text-secondary)', fontSize: '12px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    {p.isPreview && <Eye size={11} style={{ flexShrink: 0, opacity: 0.7 }} />}
                  </div>
                ))}
                <button onClick={() => { const p = content.addPage(ch.id); if (p) setActivePageId(p.id); }}
                  style={{ ...iconBtn, width: 'auto', height: '24px', padding: '0 8px', gap: '4px', fontSize: '11px', marginLeft: '8px', marginTop: '4px' }}>
                  <Plus size={11} /> Seite
                </button>
              </div>
            );
          })}
          <button onClick={() => content.addChapter()} className="btn-sage-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px', marginTop: '4px' }}>
            <Plus size={13} /> Kapitel
          </button>
        </div>

        {/* Block editor */}
        <div>
          {activePage ? (
            <PageBlocks key={activePage.id} courseId={course.id} pageId={activePage.id}
              pageTitle={activePage.title} isPreview={activePage.isPreview}
              onTitle={(t) => content.updatePage(activePage.id, { title: t })}
              onTogglePreview={() => content.updatePage(activePage.id, { isPreview: !activePage.isPreview })}
              onDeletePage={() => { content.deletePage(activePage.id); setActivePageId(null); }}
              content={content} />
          ) : (
            <div style={{ border: '1px dashed var(--border-color)', borderRadius: '14px', padding: '60px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Wähle links eine Seite — oder leg ein Kapitel und eine Seite an.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Block editor for one page ────────────────────────────────────────────────
interface PageBlocksProps {
  courseId: string;
  pageId: string;
  pageTitle: string;
  isPreview: boolean;
  onTitle: (t: string) => void;
  onTogglePreview: () => void;
  onDeletePage: () => void;
  content: ReturnType<typeof useCourseContent>;
}

const ADD_MENU: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: 'heading', label: 'Überschrift', icon: <Heading size={13} /> },
  { type: 'text', label: 'Text', icon: <Type size={13} /> },
  { type: 'callout', label: 'Callout', icon: <Megaphone size={13} /> },
  { type: 'image', label: 'Bild', icon: <ImageIcon size={13} /> },
  { type: 'video', label: 'Video', icon: <Video size={13} /> },
  { type: 'pdf', label: 'PDF', icon: <FileText size={13} /> },
  { type: 'embed', label: 'Embed', icon: <Code2 size={13} /> },
  { type: 'divider', label: 'Trenner', icon: <Minus size={13} /> },
];

const PageBlocks: React.FC<PageBlocksProps> = ({ courseId, pageId, pageTitle, isPreview, onTitle, onTogglePreview, onDeletePage, content }) => {
  const blocks = content.blocks.filter(b => b.pageId === pageId).sort((a, b) => a.position - b.position);

  return (
    <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <input value={pageTitle} onChange={(e) => onTitle(e.target.value)}
          style={{ ...inputStyle, fontSize: '20px', fontWeight: 600, border: 'none', padding: 0 }} />
        <button title={isPreview ? 'Öffentliche Vorschau: an' : 'Öffentliche Vorschau: aus'} onClick={onTogglePreview}
          style={{ ...iconBtn, color: isPreview ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
          {isPreview ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button title="Seite löschen" onClick={onDeletePage} style={iconBtn}><Trash2 size={13} /></button>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '18px' }}>
        {isPreview ? 'Diese Seite ist Teil der kostenlosen Vorschau.' : 'Nur für Käufer sichtbar.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {blocks.map((b, i) => (
          <BlockRow key={b.id} block={b} courseId={courseId}
            first={i === 0} last={i === blocks.length - 1}
            onChange={(patch) => content.updateBlock(b.id, patch)}
            onDelete={() => content.deleteBlock(b.id)}
            onMove={(dir) => content.moveBlock(b.id, dir)} />
        ))}
        {blocks.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.7, padding: '8px 0' }}>Leere Seite — füge unten einen Block hinzu.</div>}
      </div>

      {/* Add-block menu */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        {ADD_MENU.map(m => (
          <button key={m.type} onClick={() => content.addBlock(pageId, m.type)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 10px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── One block ────────────────────────────────────────────────────────────────
interface BlockRowProps {
  block: Block;
  courseId: string;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<Block>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}

const BlockRow: React.FC<BlockRowProps> = ({ block, courseId, first, last, onChange, onDelete, onMove }) => {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const setText = (text: string) => onChange({ content: { ...block.content, text } });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadCourseMedia(courseId, file);
      onChange({ content: { ...block.content, ...media } });
    } catch (err) {
      alert(`Upload fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: block.type === 'callout' ? 'var(--accent-light)' : 'transparent' }}>
      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
        <button title="Hoch" disabled={first} onClick={() => onMove(-1)} style={{ ...iconBtn, width: '22px', height: '20px', opacity: first ? 0.3 : 1 }}><ChevronUp size={11} /></button>
        <button title="Runter" disabled={last} onClick={() => onMove(1)} style={{ ...iconBtn, width: '22px', height: '20px', opacity: last ? 0.3 : 1 }}><ChevronDown size={11} /></button>
        <button title="Block löschen" onClick={onDelete} style={{ ...iconBtn, width: '22px', height: '20px' }}><Trash2 size={11} /></button>
      </div>

      {/* Body by type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {block.type === 'heading' && (
          <input value={block.content.text ?? ''} placeholder="Überschrift…" onChange={(e) => setText(e.target.value)}
            style={{ ...inputStyle, fontSize: '18px', fontWeight: 700, border: 'none', padding: 0 }} />
        )}
        {(block.type === 'text' || block.type === 'callout') && (
          <textarea value={block.content.text ?? ''} placeholder={block.type === 'callout' ? 'Hervorgehobener Hinweis…' : 'Text…'}
            onChange={(e) => setText(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', minHeight: '70px', border: 'none', background: 'transparent', padding: 0, fontSize: '13px', outline: 'none', lineHeight: 1.7, resize: 'vertical', fontFamily: block.type === 'callout' ? 'inherit' : 'inherit' }} />
        )}
        {block.type === 'divider' && <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '6px 0' }} />}
        {block.type === 'embed' && (
          <div>
            <input value={block.content.url ?? ''} placeholder="Embed-URL (YouTube, Vimeo, Loom, Figma…)" onChange={(e) => onChange({ content: { ...block.content, url: e.target.value } })}
              style={inputStyle} />
            {block.content.url && <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>Wird im Viewer als sandboxed iFrame eingebettet.</div>}
          </div>
        )}
        {isMediaBlock(block.type) && (
          <div>
            {block.content.path ? (
              <MediaPreview path={block.content.path} type={block.type} />
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '10px 0' }}>Noch keine Datei hochgeladen.</div>
            )}
            <input ref={fileRef} type="file" hidden
              accept={block.type === 'image' ? 'image/*' : block.type === 'video' ? 'video/*' : 'application/pdf'}
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <Upload size={12} /> {uploading ? 'Lädt hoch…' : block.content.path ? 'Ersetzen' : `${block.type.toUpperCase()} hochladen`}
              </button>
              {block.content.sizeBytes != null && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{(block.content.sizeBytes / 1e6).toFixed(1)} MB</span>}
            </div>
            {block.content.path && (
              <input value={block.content.caption ?? ''} placeholder="Bildunterschrift (optional)…" onChange={(e) => onChange({ content: { ...block.content, caption: e.target.value } })}
                style={{ ...inputStyle, fontSize: '12px', marginTop: '8px' }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Signed-URL preview for a private media object (resolved on demand).
const MediaPreview: React.FC<{ path: string; type: BlockType }> = ({ path, type }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ok = true;
    signedMediaUrl(path).then(u => { if (ok) setUrl(u); });
    return () => { ok = false; };
  }, [path]);

  if (!url) return <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '8px 0' }}>Lädt Vorschau…</div>;
  if (type === 'image') return <img src={url} alt="" style={{ maxWidth: '100%', borderRadius: '8px', display: 'block' }} />;
  if (type === 'video') return <video src={url} controls style={{ maxWidth: '100%', borderRadius: '8px', display: 'block' }} />;
  if (type === 'pdf') return <iframe src={url} title="PDF" style={{ width: '100%', height: '360px', border: '1px solid var(--border-color)', borderRadius: '8px' }} />;
  return null;
};

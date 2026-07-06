import React, { useEffect, useMemo, useState } from 'react';
import { usePublicCourse } from '../hooks/usePublicCourse.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { signedMediaUrl } from '../lib/media.js';
import { type Block } from '../lib/courseTypes.js';

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC course viewer (`/c/:slug`). This renders OUTSIDE the app's auth gate —
// a buyer sees only the course the creator built: chapters as modules, their
// pages, and the blocks inside. The single link back to the platform is the
// "PRONOIA" wordmark top-left; there is deliberately no studio chrome here.
// (Per-page paywall enforcement lands in Phase 3 with payment + entitlements.)
// ═══════════════════════════════════════════════════════════════════════════

const PlatformLink: React.FC = () => (
  <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
    <span style={{ width: '13px', height: '13px', background: 'var(--accent-color)', transform: 'rotate(45deg)', borderRadius: '2px', display: 'inline-block' }} />
    <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>PRONOIA</span>
  </a>
);

export const CourseViewer: React.FC<{ slug: string }> = ({ slug }) => {
  const { course, chapters, pages, blocks, loading, notFound } = usePublicCourse(slug);
  const isMobile = useIsMobile();
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // Ordered modules → pages. First page becomes the default selection.
  const modules = useMemo(() => {
    return [...chapters].sort((a, b) => a.position - b.position).map(ch => ({
      chapter: ch,
      pages: pages.filter(p => p.chapterId === ch.id).sort((a, b) => a.position - b.position),
    }));
  }, [chapters, pages]);

  const firstPageId = modules.flatMap(m => m.pages)[0]?.id ?? null;
  const activePage = pages.find(p => p.id === (activePageId ?? firstPageId)) ?? null;
  const pageBlocks = activePage ? blocks.filter(b => b.pageId === activePage.id).sort((a, b) => a.position - b.position) : [];

  if (loading) {
    return <Centered><span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>Kurs wird geladen…</span></Centered>;
  }
  if (notFound || !course) {
    return (
      <Centered>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '18px' }}><PlatformLink /></div>
          <h1 className="title-serif" style={{ fontSize: '30px', color: 'var(--text-primary)', marginBottom: '8px' }}>Kurs nicht gefunden</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Dieser Kurs existiert nicht oder ist nicht veröffentlicht.</p>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color, #faf9f6)' }}>
      {/* Top bar — only the platform link, nothing else. */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, height: '56px', display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid var(--border-color)', background: 'rgba(250,249,246,0.9)', backdropFilter: 'blur(10px)' }}>
        <PlatformLink />
      </header>

      {/* Course hero */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 0' }}>
        <h1 className="title-serif" style={{ fontSize: '38px', color: 'var(--text-primary)', margin: 0 }}>{course.title}</h1>
        {course.subtitle && <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '10px', lineHeight: 1.6, maxWidth: '680px' }}>{course.subtitle}</p>}
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '14px' }}>
          {course.priceCents > 0 ? `${(course.priceCents / 100).toFixed(2)} ${course.currency.toUpperCase()}` : 'Kostenlos'}
        </div>
      </div>

      {/* Modules nav + page content */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 100px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(220px, 260px) 1fr', gap: isMobile ? '24px' : '40px', alignItems: 'start' }}>
        {/* Left: modules (chapters) → pages */}
        <nav style={isMobile ? undefined : { position: 'sticky', top: '76px' }}>
          {modules.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Noch keine Inhalte.</div>}
          {modules.map(({ chapter, pages: mp }) => (
            <div key={chapter.id} style={{ marginBottom: '20px' }}>
              <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '8px' }}>{chapter.title.toUpperCase()}</div>
              {mp.map(p => {
                const active = activePage?.id === p.id;
                return (
                  <div key={p.id} onClick={() => setActivePageId(p.id)}
                    style={{ padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginBottom: '2px',
                      background: active ? 'var(--accent-light)' : 'transparent', color: active ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: active ? 600 : 500 }}>
                    {p.title}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Right: the active page's blocks */}
        <main style={{ minWidth: 0 }}>
          {activePage ? (
            <>
              <h2 className="title-serif" style={{ fontSize: '26px', color: 'var(--text-primary)', margin: '0 0 24px' }}>{activePage.title}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {pageBlocks.map(b => <ViewerBlock key={b.id} block={b} />)}
                {pageBlocks.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>Diese Seite ist noch leer.</p>}
              </div>
            </>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Dieser Kurs hat noch keine Seiten.</p>
          )}
        </main>
      </div>
    </div>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>{children}</div>
);

// ─── Read-only block renderers ────────────────────────────────────────────────
const ViewerBlock: React.FC<{ block: Block }> = ({ block }) => {
  const { type, content } = block;
  switch (type) {
    case 'heading':
      return <h3 className="title-serif" style={{ fontSize: '22px', color: 'var(--text-primary)', margin: '8px 0 0' }}>{content.text}</h3>;
    case 'text':
      return <p style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{content.text}</p>;
    case 'callout':
      return (
        <div style={{ background: 'var(--accent-light)', borderLeft: '3px solid var(--accent-color)', borderRadius: '8px', padding: '14px 18px', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {content.text}
        </div>
      );
    case 'divider':
      return <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />;
    case 'embed':
      return <EmbedFrame url={content.url ?? ''} />;
    case 'image':
    case 'video':
    case 'pdf':
      return <MediaBlock block={block} />;
    default:
      return null;
  }
};

// Signed-URL media (bucket stays private; anon can sign for published courses).
const MediaBlock: React.FC<{ block: Block }> = ({ block }) => {
  const [url, setUrl] = useState<string | null>(null);
  const path = block.content.path;
  useEffect(() => {
    if (!path) return;
    let ok = true;
    signedMediaUrl(path, 7200).then(u => { if (ok) setUrl(u); });
    return () => { ok = false; };
  }, [path]);

  if (!path) return null;
  const caption = block.content.caption;
  const media = !url ? (
    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Medien werden geladen…</div>
  ) : block.type === 'image' ? (
    <img src={url} alt={caption ?? ''} style={{ maxWidth: '100%', borderRadius: '10px', display: 'block' }} />
  ) : block.type === 'video' ? (
    <video src={url} controls style={{ width: '100%', borderRadius: '10px', display: 'block', background: '#000' }} />
  ) : (
    <iframe src={url} title={caption ?? 'PDF'} style={{ width: '100%', height: '640px', border: '1px solid var(--border-color)', borderRadius: '10px' }} />
  );

  return (
    <figure style={{ margin: 0 }}>
      {media}
      {caption && <figcaption style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'center' }}>{caption}</figcaption>}
    </figure>
  );
};

// Normalize common providers to an embeddable URL, then sandbox the iframe.
function toEmbedUrl(raw: string): string {
  const url = raw.trim();
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

const EmbedFrame: React.FC<{ url: string }> = ({ url }) => {
  if (!url) return null;
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <iframe
        src={toEmbedUrl(url)}
        title="Embed"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
};

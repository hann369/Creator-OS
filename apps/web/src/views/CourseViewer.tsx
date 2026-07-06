import React, { useEffect, useMemo, useState } from 'react';
import { Lock, LogOut } from 'lucide-react';
import { usePublicCourse } from '../hooks/usePublicCourse.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { signedMediaUrl } from '../lib/media.js';
import { sendBuyerMagicLink, grantFreeAccess, startCheckout, signOutBuyer } from '../lib/coursePurchase.js';
import { type Block } from '../lib/courseTypes.js';

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC course viewer (`/c/:slug`). Outside the app's auth gate. A visitor sees
// only the course the creator built — chapters as modules, their pages, blocks —
// plus a "PRONOIA" wordmark top-left back to the platform. No studio chrome.
//
// Phase 3 paywall: preview pages are open to everyone; non-preview pages are
// locked until the visitor holds an entitlement (free self-grant, or a Stripe
// purchase). RLS enforces this server-side — the lock UI just mirrors it.
// ═══════════════════════════════════════════════════════════════════════════

const PlatformLink: React.FC = () => (
  <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
    <img src="/logo.png" alt="Pronoia" style={{ height: '20px', mixBlendMode: 'multiply', objectFit: 'contain' }} />
  </a>
);

const priceLabel = (cents: number, currency: string) => cents > 0 ? `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}` : 'Kostenlos';

export const CourseViewer: React.FC<{ slug: string }> = ({ slug }) => {
  const { course, chapters, pages, blocks, loading, notFound, userEmail, entitled, refetch } = usePublicCourse(slug);
  const isMobile = useIsMobile();
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<string | null>(null);

  // Extract purchase parameter from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('purchase');
    if (status) {
      setPurchaseStatus(status);
    }
  }, []);

  // Poll for entitlement if purchase is success but not entitled yet
  useEffect(() => {
    if (purchaseStatus === 'success' && !entitled) {
      const interval = setInterval(() => {
        refetch();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [purchaseStatus, entitled, refetch]);

  // Clean up URL query parameters once entitled is true
  useEffect(() => {
    if (entitled && purchaseStatus === 'success') {
      const url = new URL(window.location.href);
      url.searchParams.delete('purchase');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [entitled, purchaseStatus]);

  const modules = useMemo(() => {
    return [...chapters].sort((a, b) => a.position - b.position).map(ch => ({
      chapter: ch,
      pages: pages.filter(p => p.chapterId === ch.id).sort((a, b) => a.position - b.position),
    }));
  }, [chapters, pages]);

  const firstPageId = modules.flatMap(m => m.pages)[0]?.id ?? null;
  const activePage = pages.find(p => p.id === (activePageId ?? firstPageId)) ?? null;
  const activeLocked = !!activePage && !activePage.isPreview && !entitled;
  const pageBlocks = activePage ? blocks.filter(b => b.pageId === activePage.id).sort((a, b) => a.position - b.position) : [];

  if (loading) return <Centered><span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>Kurs wird geladen…</span></Centered>;
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
      <header style={{ position: 'sticky', top: 0, zIndex: 10, height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid var(--border-color)', background: 'rgba(250,249,246,0.9)', backdropFilter: 'blur(10px)' }}>
        <PlatformLink />
        {userEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            <span title={userEmail} style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</span>
            <button onClick={() => signOutBuyer().then(refetch)} title="Abmelden" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-color)', borderRadius: '99px', background: 'transparent', color: 'var(--text-secondary)', padding: '4px 8px', cursor: 'pointer' }}>
              <LogOut size={12} />
            </button>
          </div>
        )}
      </header>

      {purchaseStatus === 'success' && (
        <div style={{
          padding: '12px 24px',
          background: entitled ? 'var(--accent-light)' : '#fffbeb',
          borderBottom: '1px solid ' + (entitled ? 'rgba(15,90,71,0.12)' : '#fef3c7'),
          color: entitled ? 'var(--accent-color)' : '#b45309',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>
            {entitled 
              ? '🎉 Vielen Dank! Dein Kauf war erfolgreich. Du hast jetzt vollen Zugriff.' 
              : '⏳ Zahlung wird verarbeitet. Dein Zugang wird in Kürze freigeschaltet...'}
          </span>
          {entitled && (
            <button 
              onClick={() => setPurchaseStatus(null)} 
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Schließen
            </button>
          )}
        </div>
      )}
      {purchaseStatus === 'cancelled' && (
        <div style={{
          padding: '12px 24px',
          background: '#fef2f2',
          borderBottom: '1px solid #fee2e2',
          color: '#b91c1c',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>⚠️ Der Bezahlvorgang wurde abgebrochen. Du kannst es gerne noch einmal versuchen.</span>
          <button 
            onClick={() => {
              setPurchaseStatus(null);
              const url = new URL(window.location.href);
              url.searchParams.delete('purchase');
              window.history.replaceState({}, '', url.pathname + url.search);
            }} 
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Schließen
          </button>
        </div>
      )}

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 0' }}>
        <h1 className="title-serif" style={{ fontSize: '38px', color: 'var(--text-primary)', margin: 0 }}>{course.title}</h1>
        {course.subtitle && <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '10px', lineHeight: 1.6, maxWidth: '680px' }}>{course.subtitle}</p>}
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '14px' }}>
          {entitled ? 'Vollzugriff' : priceLabel(course.priceCents, course.currency)}
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 100px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(220px, 260px) 1fr', gap: isMobile ? '24px' : '40px', alignItems: 'start' }}>
        <nav style={isMobile ? undefined : { position: 'sticky', top: '76px' }}>
          {modules.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Noch keine Inhalte.</div>}
          {modules.map(({ chapter, pages: mp }) => (
            <div key={chapter.id} style={{ marginBottom: '20px' }}>
              <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '8px' }}>{chapter.title.toUpperCase()}</div>
              {mp.map(p => {
                const active = activePage?.id === p.id;
                const locked = !p.isPreview && !entitled;
                return (
                  <div key={p.id} onClick={() => setActivePageId(p.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginBottom: '2px',
                      background: active ? 'var(--accent-light)' : 'transparent', color: active ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: active ? 600 : 500 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    {locked && <Lock size={11} style={{ flexShrink: 0, opacity: 0.6 }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <main style={{ minWidth: 0 }}>
          {activePage ? (
            <>
              <h2 className="title-serif" style={{ fontSize: '26px', color: 'var(--text-primary)', margin: '0 0 24px' }}>{activePage.title}</h2>
              {activeLocked ? (
                <Paywall course={course} slug={slug} signedInEmail={userEmail} onUnlocked={refetch} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {pageBlocks.map(b => <ViewerBlock key={b.id} block={b} />)}
                  {pageBlocks.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>Diese Seite ist noch leer.</p>}
                </div>
              )}
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

// ─── Paywall: sign in (magic-link) → free self-grant OR Stripe checkout ───────
const Paywall: React.FC<{ course: import('../lib/courseTypes.js').Course; slug: string; signedInEmail: string | null; onUnlocked: () => void }> = ({ course, slug, signedInEmail, onUnlocked }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isFree = course.priceCents === 0;

  const sendLink = async () => {
    if (!email.trim()) return;
    setBusy(true); setMsg(null);
    const { error } = await sendBuyerMagicLink(email, slug);
    setBusy(false);
    setMsg(error ? `Fehler: ${error}` : 'Check deine E-Mails — wir haben dir einen Zugangs-Link geschickt.');
  };

  const unlock = async () => {
    setBusy(true); setMsg(null);
    if (isFree) {
      const { error } = await grantFreeAccess(course.id);
      setBusy(false);
      if (error) { setMsg(`Fehler: ${error}`); return; }
      onUnlocked();
    } else {
      const { error } = await startCheckout(course.id); // redirects on success
      setBusy(false);
      if (error) setMsg(error === 'not-signed-in' ? 'Bitte zuerst anmelden.' : `Bezahlung nicht verfügbar: ${error}`);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '16px', padding: '32px', background: 'rgba(0,0,0,0.015)', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent-color)', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
        <Lock size={20} />
      </div>
      <h3 className="title-serif" style={{ fontSize: '22px', color: 'var(--text-primary)', margin: '0 0 8px' }}>
        {isFree ? 'Kostenlos freischalten' : `Zugang für ${priceLabel(course.priceCents, course.currency)}`}
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '420px', margin: '0 auto 20px' }}>
        {isFree
          ? 'Dieser Teil ist Teil des Kurses. Melde dich kurz an, um ihn dauerhaft freizuschalten.'
          : 'Kaufe den Kurs, um alle Module freizuschalten. Deine Zugänge sind an deine E-Mail geknüpft.'}
      </p>

      {!signedInEmail ? (
        <div style={{ maxWidth: '360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="email" placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendLink(); }}
            style={{ fontSize: '14px', border: '1px solid var(--border-color)', padding: '11px 14px', borderRadius: '10px', outline: 'none', background: 'var(--bg-color, #fff)', width: '100%', boxSizing: 'border-box' }} />
          <button onClick={sendLink} disabled={busy} className="btn-sage-primary" style={{ padding: '11px', fontSize: '13px' }}>
            {busy ? 'Sende…' : 'Zugangs-Link per E-Mail'}
          </button>
        </div>
      ) : (
        <button onClick={unlock} disabled={busy} className="btn-sage-primary" style={{ padding: '11px 28px', fontSize: '13px' }}>
          {busy ? 'Einen Moment…' : isFree ? 'Jetzt freischalten' : `Kaufen — ${priceLabel(course.priceCents, course.currency)}`}
        </button>
      )}

      {msg && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '16px', lineHeight: 1.5 }}>{msg}</p>}
    </div>
  );
};

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

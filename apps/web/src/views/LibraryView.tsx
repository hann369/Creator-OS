import React, { useMemo, useState } from 'react';
import { Library, Search, Plus, TrendingUp, Sparkles, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import { useLibrary, type LibEntry } from '../hooks/useLibrary.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const inputStyle: React.CSSProperties = { fontSize: '13px', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };
const chip: React.CSSProperties = { fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: '6px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
const label: React.CSSProperties = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', margin: '0 0 6px', fontWeight: 600 };

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

function outlierColor(labelText?: string): string {
  if (labelText === 'Extreme Outlier') return '#c2410c';
  if (labelText === 'High Performer') return 'var(--accent-color)';
  return 'var(--text-secondary)';
}

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

export const LibraryView: React.FC = () => {
  const { entries, loading, refresh, ingest, deleteEntry } = useLibrary();
  const isMobile = useIsMobile();

  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [hook, setHook] = useState('');
  const [seed, setSeed] = useState('');
  const [mechanism, setMechanism] = useState('');

  const hooks = useMemo(() => uniq(entries.map((e) => e.analysis?.hookPattern)), [entries]);
  const seeds = useMemo(() => uniq(entries.map((e) => e.analysis?.seedPattern)), [entries]);
  const mechs = useMemo(() => uniq(entries.map((e) => e.analysis?.mechanism)), [entries]);
  const platforms = useMemo(() => uniq(entries.map((e) => e.platform)), [entries]);

  const filtered = useMemo(() => entries.filter((e) => {
    if (platform && e.platform !== platform) return false;
    if (hook && e.analysis?.hookPattern !== hook) return false;
    if (seed && e.analysis?.seedPattern !== seed) return false;
    if (mechanism && e.analysis?.mechanism !== mechanism) return false;
    if (q) {
      const hay = `${e.title} ${e.creator} ${e.analysis?.topic ?? ''} ${e.transcript.slice(0, 400)}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [entries, platform, hook, seed, mechanism, q]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const doIngest = async () => {
    if (!url.trim() || busy) return;
    setBusy(true); setMsg(null);
    const r = await ingest(url.trim());
    if (!r.ok) { setMsg(r.error ?? 'Failed'); setBusy(false); return; }
    setMsg('Importing… analysis runs in the background.');
    setUrl('');
    // Poll a few times so the new card + analysis appear without a manual reload.
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      await refresh();
      if (tries >= 8) { clearInterval(poll); setBusy(false); setMsg(null); }
    }, 2500);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Möchtest du dieses Video wirklich aus deiner Library löschen?')) return;
    const r = await deleteEntry(id);
    if (!r.ok) {
      alert(r.error ?? 'Fehler beim Löschen');
    } else {
      setSelectedId(null);
    }
  };

  return (
    <div className="view-body" style={{ maxWidth: '1180px', margin: '0 auto', padding: '40px 24px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Library size={20} color="var(--accent-color)" />
        <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', margin: 0 }}>Library</h1>
        <button title="Refresh" onClick={() => refresh()} style={{ ...chip, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
        Deine Content-Intelligence-Datenbank. Füge eine YouTube- oder Instagram-URL ein — Pronoia extrahiert Hook, Pattern,
        Mechanism und Takeaways automatisch.
      </p>

      {/* Ingest bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
        <input style={inputStyle} placeholder="https://youtube.com/shorts/…  oder  https://instagram.com/reel/…"
          value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doIngest(); }} />
        <button className="btn-sage-primary" onClick={doIngest} disabled={busy}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '12px', flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Import
        </button>
      </div>
      {msg && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '18px' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '190px 1fr 320px', gap: '20px', alignItems: 'start', marginTop: '18px' }}>
        {/* Filters */}
        {!isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '80px' }}>
            <div>
              <div style={label}>Search</div>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '9px', top: '10px', color: 'var(--text-secondary)' }} />
                <input style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="topic, creator…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <FilterSelect title="Platform" value={platform} onChange={setPlatform} options={platforms} />
            <FilterSelect title="Hook Pattern" value={hook} onChange={setHook} options={hooks} />
            <FilterSelect title="Seed Pattern" value={seed} onChange={setSeed} options={seeds} />
            <FilterSelect title="Mechanism" value={mechanism} onChange={setMechanism} options={mechs} />
          </div>
        )}

        {/* Result grid */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>Lade…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
              {entries.length === 0 ? 'Noch nichts importiert. Füge oben eine URL ein.' : 'Keine Treffer für diese Filter.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
              {filtered.map((e) => <Card key={e.id} entry={e} active={e.id === selectedId} onClick={() => setSelectedId(e.id)} />)}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {!isMobile && (
          <div style={{ position: 'sticky', top: '80px' }}>
            {selected ? <DetailPanel entry={selected} onDelete={handleDelete} /> : (
              <div style={{ border: '1px dashed var(--border-color)', borderRadius: '14px', padding: '40px 20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Wähle eine Karte für die vollständige AI-Analyse.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const FilterSelect: React.FC<{ title: string; value: string; onChange: (v: string) => void; options: string[] }> = ({ title, value, onChange, options }) => (
  <div>
    <div style={label}>{title}</div>
    <select style={{ ...inputStyle, fontSize: '12px' }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Alle</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const Card: React.FC<{ entry: LibEntry; active: boolean; onClick: () => void }> = ({ entry, active, onClick }) => {
  const pending = entry.status !== 'completed' && entry.status !== 'failed';
  return (
    <div onClick={onClick} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', background: active ? 'var(--accent-light)' : 'rgba(0,0,0,0.015)' }}>
      <div style={{ aspectRatio: '16/9', background: 'rgba(0,0,0,0.06)', backgroundImage: entry.thumbnail ? `url(${entry.thumbnail})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
        {entry.outlier && entry.outlier.label !== 'Normal' && (
          <span style={{ position: 'absolute', top: '6px', left: '6px', ...chip, background: 'var(--bg-primary, #fff)', color: outlierColor(entry.outlier.label), borderColor: outlierColor(entry.outlier.label), display: 'flex', alignItems: 'center', gap: '3px' }}>
            <TrendingUp size={9} /> {entry.outlier.outlierScore}×
          </span>
        )}
        {pending && (
          <span style={{ position: 'absolute', top: '6px', right: '6px', ...chip, background: 'var(--bg-primary,#fff)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Loader2 size={9} className="spin" /> {entry.status}
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {entry.title || entry.analysis?.topic || entry.canonicalUrl}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.creator || entry.platform}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtNum(entry.statistics.views)} views</span>
        </div>
        {entry.analysis && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
            <span style={chip}>{entry.analysis.hookPattern}</span>
            <span style={chip}>{entry.analysis.seedPattern}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '14px' }}>
    <div style={label}>{title}</div>
    <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.55 }}>{children}</div>
  </div>
);

const TagRow: React.FC<{ items: string[] }> = ({ items }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>{items.map((t, i) => <span key={i} style={chip}>{t}</span>)}</div>
);

const DetailPanel: React.FC<{ entry: LibEntry; onDelete: (id: string) => void }> = ({ entry, onDelete }) => {
  const a = entry.analysis;
  return (
    <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <Sparkles size={14} color="var(--accent-color)" />
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>AI Analysis</span>
        {a && <span style={{ ...chip, marginLeft: 'auto' }}>conf {Math.round(a.confidence * 100)}%</span>}
      </div>

      <Section title="Title">{entry.title || '—'}</Section>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <Stat k="Views" v={fmtNum(entry.statistics.views)} />
        <Stat k="Likes" v={fmtNum(entry.statistics.likes)} />
        {entry.outlier && <Stat k="Outlier" v={`${entry.outlier.outlierScore}×`} color={outlierColor(entry.outlier.label)} />}
      </div>

      {entry.status === 'failed' && <div style={{ fontSize: '11px', color: '#c2410c', marginBottom: '12px' }}>Analyse fehlgeschlagen: {entry.error}</div>}

      {a ? (
        <>
          <Section title="Topic">{a.topic}{a.subTopics?.length ? <> · <span style={{ color: 'var(--text-secondary)' }}>{a.subTopics.join(', ')}</span></> : null}</Section>
          <Section title="Hook">“{a.hook}”</Section>
          <Section title="Patterns"><div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            <span style={chip}>Hook: {a.hookPattern}</span>
            <span style={chip}>Seed: {a.seedPattern}</span>
            <span style={chip}>Mech: {a.mechanism}</span>
            <span style={chip}>Story: {a.storyStructure}</span>
          </div></Section>
          <Section title="Promise">{a.promise || '—'}</Section>
          {a.actionableTakeaways?.length > 0 && (
            <Section title="Takeaways"><ul style={{ margin: 0, paddingLeft: '16px' }}>{a.actionableTakeaways.map((t, i) => <li key={i} style={{ marginBottom: '4px' }}>{t}</li>)}</ul></Section>
          )}
          {a.retentionTechniques?.length > 0 && <Section title="Retention"><TagRow items={a.retentionTechniques} /></Section>}
          {a.claims?.length > 0 && (
            <Section title="Claims"><ul style={{ margin: 0, paddingLeft: '16px' }}>{a.claims.map((t, i) => <li key={i} style={{ marginBottom: '4px' }}>{t}</li>)}</ul></Section>
          )}
          {a.scientificReferences?.length > 0 && <Section title="References"><TagRow items={a.scientificReferences} /></Section>}
        </>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Analyse läuft noch…</div>
      )}

      {entry.transcript && (
        <Section title="Transcript">
          <div style={{ maxHeight: '120px', overflowY: 'auto', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {entry.transcript.slice(0, 1200)}{entry.transcript.length > 1200 ? '…' : ''}
          </div>
        </Section>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <a href={entry.url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent-color)', textDecoration: 'none' }}>Original ansehen →</a>
        <button onClick={() => onDelete(entry.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Trash2 size={12} /> Video löschen
        </button>
      </div>
    </div>
  );
};

const Stat: React.FC<{ k: string; v: string; color?: string }> = ({ k, v, color }) => (
  <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>{k}</div>
    <div style={{ fontSize: '15px', fontWeight: 700, color: color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{v}</div>
  </div>
);

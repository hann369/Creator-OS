import React, { useMemo, useState } from 'react';
import { Library, Search, Plus, TrendingUp, Sparkles, RefreshCw, Loader2, Trash2, X, Database, ExternalLink, Boxes, Blocks, FileDown, Recycle } from 'lucide-react';
import { useLibrary, type LibEntry } from '../hooks/useLibrary.js';
import { useHookDatabase, type HookEntry } from '../hooks/useHookDatabase.js';
import { useRemixReports, downloadReportMarkdown } from '../hooks/useRemixOutput.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { EDITING_CODEX, type CodexEntry } from '../lib/editingCodex.js';
import { LEGO_BRICKS, PRODUCTION_STAGES, brickById, type LegoBrick, type BrickOption } from '../lib/legoBricks.js';

type LibTab = 'videos' | 'hooks' | 'bricks' | 'codex' | 'output';

const mediaTypeLabel = (mt: string) => (mt === 'short' ? 'Short' : mt === 'longform' ? 'Long' : mt);

const inputStyle: React.CSSProperties = { fontSize: '13px', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };
const chip: React.CSSProperties = { fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: '6px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
const label: React.CSSProperties = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', margin: '0 0 6px', fontWeight: 600 };

const fmtNum = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
};

function outlierColor(labelText?: string): string {
  if (labelText === 'Extreme Outlier') return '#c2410c';
  if (labelText === 'High Performer') return 'var(--accent-color)';
  return 'var(--text-secondary)';
}

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

export const LibraryView: React.FC = () => {
  const { entries, loading, refresh, ingest, deleteEntry } = useLibrary();
  const { entries: hookEntries, loading: hooksLoading } = useHookDatabase();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<LibTab>('videos');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Selection states
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null);
  const [selectedCodexId, setSelectedCodexId] = useState<string | null>(null);

  // Lego Bricks tab: which of the 11 bricks is open, its option search + selection.
  const [selectedBrickId, setSelectedBrickId] = useState<string>('format');
  const [bq, setBq] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const activeBrick = brickById(selectedBrickId) ?? LEGO_BRICKS[0];
  const filteredOptions = useMemo(() => activeBrick.options.filter((o) => {
    if (!bq) return true;
    const hay = `${o.name} ${o.description ?? ''} ${o.category ?? ''} ${o.example ?? ''} ${o.startingPoint ?? ''}`.toLowerCase();
    return hay.includes(bq.toLowerCase());
  }), [activeBrick, bq]);
  const selectedOption = activeBrick.options.find((o) => o.id === selectedOptionId) ?? null;

  // Video Filters
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [mtype, setMtype] = useState('');
  const [hook, setHook] = useState('');
  const [seed, setSeed] = useState('');
  const [mechanism, setMechanism] = useState('');

  // Hook Database Filters
  const [hq, setHq] = useState('');
  const [hStructure, setHStructure] = useState('');
  const [hNiche, setHNiche] = useState('');
  const [hType, setHType] = useState('');

  // Codex Filters
  const [cq, setCq] = useState('');
  const [cCategory, setCCategory] = useState('');

  const hooks = useMemo(() => uniq(entries.map((e) => e.analysis?.hookPattern)), [entries]);
  const seeds = useMemo(() => uniq(entries.map((e) => e.analysis?.format ?? e.analysis?.seedPattern)), [entries]);
  const mechs = useMemo(() => uniq(entries.map((e) => e.analysis?.mechanism)), [entries]);
  const platforms = useMemo(() => uniq(entries.map((e) => e.platform)), [entries]);

  const hookStructures = useMemo(() => uniq(hookEntries.map((e) => e.spoken_hook_structure)), [hookEntries]);
  const hookNiches = useMemo(() => uniq(hookEntries.map((e) => e.niche)), [hookEntries]);
  const hookTypes = useMemo(() => uniq(hookEntries.map((e) => e.content_type)), [hookEntries]);

  const codexCategories = useMemo(() => uniq(EDITING_CODEX.map((e) => e.category)), []);

  // Filtered lists
  const filtered = useMemo(() => entries.filter((e) => {
    if (platform && e.platform !== platform) return false;
    if (mtype && e.mediaType !== mtype) return false;
    if (hook && e.analysis?.hookPattern !== hook) return false;
    if (seed && (e.analysis?.format ?? e.analysis?.seedPattern) !== seed) return false;
    if (mechanism && e.analysis?.mechanism !== mechanism) return false;
    if (q) {
      const hay = `${e.title} ${e.creator} ${e.analysis?.topic ?? ''} ${e.transcript.slice(0, 400)}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [entries, platform, mtype, hook, seed, mechanism, q]);

  const filteredHooks = useMemo(() => hookEntries.filter((e) => {
    if (hStructure && e.spoken_hook_structure !== hStructure) return false;
    if (hNiche && e.niche !== hNiche) return false;
    if (hType && e.content_type !== hType) return false;
    if (hq) {
      const hay = `${e.title} ${e.actual_spoken_hook} ${e.niche} ${e.spoken_hook_structure}`.toLowerCase();
      if (!hay.includes(hq.toLowerCase())) return false;
    }
    return true;
  }), [hookEntries, hStructure, hNiche, hType, hq]);

  const filteredCodex = useMemo(() => EDITING_CODEX.filter((e) => {
    if (cCategory && e.category !== cCategory) return false;
    if (cq) {
      const hay = `${e.title} ${e.content} ${e.tags.join(' ')} ${e.category}`.toLowerCase();
      if (!hay.includes(cq.toLowerCase())) return false;
    }
    return true;
  }), [cq, cCategory]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const selectedHook = hookEntries.find((e) => e.id === selectedHookId) ?? null;
  const selectedCodex = EDITING_CODEX.find((e) => e.id === selectedCodexId) ?? null;

  const doIngest = async () => {
    if (!url.trim() || busy) return;
    setBusy(true); setMsg(null);
    const r = await ingest(url.trim());
    if (!r.ok) { setMsg(r.error ?? 'Failed'); setBusy(false); return; }
    setMsg('Importing… analysis runs in the background.');
    setUrl('');
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

  const showDetailPanel = !isMobile && (
    activeTab === 'videos' ? selected !== null
      : activeTab === 'hooks' ? selectedHook !== null
        : activeTab === 'bricks' ? selectedOption !== null
          : activeTab === 'codex' ? selectedCodex !== null
            : false
  );

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
        Deine Content-Intelligence-Datenbank. Analysiere virale Kurzvideos, studiere die Hook-Datenbank (4 Komponenten),
        blättere durch die Short-Form Lego Bricks oder schaue in den Editing Codex.
      </p>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <TabButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')}>Video Library</TabButton>
        <TabButton active={activeTab === 'hooks'} onClick={() => setActiveTab('hooks')} icon={<Database size={13} />}>Hooks</TabButton>
        <TabButton active={activeTab === 'bricks'} onClick={() => setActiveTab('bricks')} icon={<Boxes size={13} />}>Lego Bricks</TabButton>
        <TabButton active={activeTab === 'codex'} onClick={() => setActiveTab('codex')} icon={<Sparkles size={13} />}>Editing Codex</TabButton>
        <TabButton active={activeTab === 'output'} onClick={() => setActiveTab('output')} icon={<Recycle size={13} />}>Output</TabButton>
      </div>

      {activeTab === 'videos' ? (
        <>
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
        </>
      ) : null}

      {activeTab === 'output' ? (
        <RemixOutputTab />
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : showDetailPanel ? '190px 1fr 320px' : '190px 1fr', gap: '20px', alignItems: 'start', marginTop: '18px', transition: 'grid-template-columns 0.25s ease' }}>
        {/* Filters */}
        {!isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '80px' }}>
            {activeTab === 'videos' ? (
              <>
                <div>
                  <div style={label}>Search</div>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '9px', top: '10px', color: 'var(--text-secondary)' }} />
                    <input style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="topic, creator…" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                </div>
                <FilterSelect title="Platform" value={platform} onChange={setPlatform} options={platforms} />
                <div>
                  <div style={label}>Typ</div>
                  <select style={{ ...inputStyle, fontSize: '12px' }} value={mtype} onChange={(e) => setMtype(e.target.value)}>
                    <option value="">Alle</option>
                    <option value="short">Shorts (Shorts & Reels)</option>
                    <option value="longform">Long (normale Videos)</option>
                  </select>
                </div>
                <FilterSelect title="Hook Pattern" value={hook} onChange={setHook} options={hooks} />
                <FilterSelect title="Format" value={seed} onChange={setSeed} options={seeds} />
                <FilterSelect title="Mechanism" value={mechanism} onChange={setMechanism} options={mechs} />
              </>
            ) : activeTab === 'hooks' ? (
              <>
                <div>
                  <div style={label}>Search</div>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '9px', top: '10px', color: 'var(--text-secondary)' }} />
                    <input style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="hook keyword…" value={hq} onChange={(e) => setHq(e.target.value)} />
                  </div>
                </div>
                <FilterSelect title="Hook Structure" value={hStructure} onChange={setHStructure} options={hookStructures} />
                <FilterSelect title="Niche" value={hNiche} onChange={setHNiche} options={hookNiches} />
                <FilterSelect title="Content Type" value={hType} onChange={setHType} options={hookTypes} />
              </>
            ) : activeTab === 'bricks' ? (
              <BrickSelector selectedBrickId={selectedBrickId} onSelect={(id) => { setSelectedBrickId(id); setSelectedOptionId(null); }} search={bq} onSearch={setBq} />
            ) : (
              <>
                <div>
                  <div style={label}>Search</div>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '9px', top: '10px', color: 'var(--text-secondary)' }} />
                    <input style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="codex keyword…" value={cq} onChange={(e) => setCq(e.target.value)} />
                  </div>
                </div>
                <FilterSelect title="Category" value={cCategory} onChange={setCCategory} options={codexCategories} />
              </>
            )}
          </div>
        )}

        {/* Result grid */}
        <div>
          {activeTab === 'videos' ? (
            loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>Lade…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                {entries.length === 0 ? 'Noch nichts importiert. Füge oben eine URL ein.' : 'Keine Treffer für diese Filter.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                {filtered.map((e) => <Card key={e.id} entry={e} active={e.id === selectedId} onClick={() => setSelectedId(selectedId === e.id ? null : e.id)} />)}
              </div>
            )
          ) : activeTab === 'hooks' ? (
            hooksLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>Lade Hook-Datenbank…</div>
            ) : filteredHooks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                Keine passenden Hooks gefunden.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                {filteredHooks.map((e) => (
                  <HookCard
                    key={e.id}
                    entry={e}
                    active={e.id === selectedHookId}
                    onClick={() => setSelectedHookId(selectedHookId === e.id ? null : e.id)}
                  />
                ))}
              </div>
            )
          ) : activeTab === 'bricks' ? (
            filteredOptions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                Keine passenden Optionen in diesem Brick.
              </div>
            ) : (
              <BrickOptionGrid brick={activeBrick} options={filteredOptions} selectedId={selectedOptionId} onSelect={(id) => setSelectedOptionId(selectedOptionId === id ? null : id)} />
            )
          ) : (
            filteredCodex.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                Keine passenden Codex-Einträge gefunden.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                {filteredCodex.map((e) => (
                  <CodexCard
                    key={e.id}
                    entry={e}
                    active={e.id === selectedCodexId}
                    onClick={() => setSelectedCodexId(selectedCodexId === e.id ? null : e.id)}
                  />
                ))}
              </div>
            )
          )}
        </div>

        {/* Detail panel */}
        {!isMobile && activeTab === 'videos' && selected && (
          <div style={{ position: 'sticky', top: '80px' }}>
            <DetailPanel entry={selected} onDelete={handleDelete} onClose={() => setSelectedId(null)} />
          </div>
        )}

        {!isMobile && activeTab === 'hooks' && selectedHook && (
          <div style={{ position: 'sticky', top: '80px' }}>
            <HookDetailPanel entry={selectedHook} onClose={() => setSelectedHookId(null)} />
          </div>
        )}

        {!isMobile && activeTab === 'bricks' && selectedOption && (
          <div style={{ position: 'sticky', top: '80px' }}>
            <BrickOptionDetail brick={activeBrick} option={selectedOption} onClose={() => setSelectedOptionId(null)} />
          </div>
        )}

        {!isMobile && activeTab === 'codex' && selectedCodex && (
          <div style={{ position: 'sticky', top: '80px' }}>
            <CodexDetailPanel entry={selectedCodex} onClose={() => setSelectedCodexId(null)} />
          </div>
        )}
      </div>
      )}
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

  const getCardStyle = (): React.CSSProperties => {
    const isYt = entry.platform === 'youtube';
    const isIg = entry.platform === 'instagram';

    const base: React.CSSProperties = {
      borderRadius: '12px',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxSizing: 'border-box'
    };

    if (isYt) {
      return {
        ...base,
        background: active ? 'var(--accent-light)' : 'rgba(0,0,0,0.015)',
        border: active ? '2.5px solid #ef4444' : '2.5px solid rgba(239, 68, 68, 0.25)',
        boxShadow: active ? '0 0 10px rgba(239, 68, 68, 0.25)' : 'none'
      };
    }

    if (isIg) {
      return {
        ...base,
        border: '2.5px solid transparent',
        backgroundImage: active
          ? 'linear-gradient(var(--accent-light, #f0fdf4), var(--accent-light, #f0fdf4)), linear-gradient(135deg, #fcd34d, #d946ef, #a21caf)'
          : 'linear-gradient(#fafafa, #fafafa), linear-gradient(135deg, rgba(252, 211, 77, 0.4), rgba(217, 70, 239, 0.4), rgba(162, 28, 175, 0.4))',
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
        boxShadow: active ? '0 0 10px rgba(162, 28, 175, 0.25)' : 'none'
      };
    }

    return {
      ...base,
      background: active ? 'var(--accent-light)' : 'rgba(0,0,0,0.015)',
      border: active ? '2.5px solid var(--accent-color)' : '1px solid var(--border-color)'
    };
  };

  return (
    <div onClick={onClick} style={getCardStyle()}>
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
          <span style={{ ...chip, fontWeight: 600, color: entry.mediaType === 'longform' ? '#0369a1' : 'var(--accent-color)', borderColor: entry.mediaType === 'longform' ? '#0369a1' : 'var(--accent-color)' }}>{mediaTypeLabel(entry.mediaType)}</span>
          {entry.analysis && (
            <>
              <span style={chip}>{entry.analysis.hookPattern}</span>
              <span style={chip}>{entry.analysis.format ?? entry.analysis.seedPattern}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const HookCard: React.FC<{ entry: HookEntry; active: boolean; onClick: () => void }> = ({ entry, active, onClick }) => {
  return (
    <div onClick={onClick} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', cursor: 'pointer', background: active ? 'var(--accent-light)' : 'rgba(0,0,0,0.015)', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s ease', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
        <span style={{ ...chip, background: 'var(--accent-light)', borderColor: 'var(--accent-color)', color: 'var(--accent-color)', fontWeight: 600 }}>{entry.spoken_hook_structure}</span>
        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{fmtNum(entry.views)} views</span>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {entry.title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
        {entry.niche && <span style={chip}>{entry.niche}</span>}
        {entry.content_type && <span style={chip}>{entry.content_type}</span>}
        {entry.performance && <span style={{ ...chip, color: 'var(--accent-color)' }}>Rank #{entry.performance}</span>}
      </div>
    </div>
  );
};

const CodexCard: React.FC<{ entry: CodexEntry; active: boolean; onClick: () => void }> = ({ entry, active, onClick }) => {
  return (
    <div onClick={onClick} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', cursor: 'pointer', background: active ? 'var(--accent-light)' : 'rgba(0,0,0,0.015)', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s ease', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
        <span style={{ ...chip, background: 'var(--accent-light)', borderColor: 'var(--accent-color)', color: 'var(--accent-color)', fontWeight: 600 }}>{entry.category}</span>
      </div>
      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
        {entry.title}
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.45, flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {entry.content}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
        {entry.tags.map(t => <span key={t} style={chip}>#{t}</span>)}
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

const DetailPanel: React.FC<{ entry: LibEntry; onDelete: (id: string) => void; onClose: () => void }> = ({ entry, onDelete, onClose }) => {
  const a = entry.analysis;
  return (
    <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <Sparkles size={14} color="var(--accent-color)" />
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>AI Analysis</span>
        {a && <span style={{ ...chip, marginLeft: 'auto' }}>conf {Math.round(a.confidence * 100)}%</span>}
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', marginLeft: a ? '0' : 'auto' }}>
          <X size={14} />
        </button>
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
          <Section title="Seed (Core Idea)">{a.seed || '—'}</Section>
          {a.substance && <Section title="Substance">{a.substance}</Section>}
          <Section title="Hook">“{a.hook}”</Section>
          <Section title="Patterns"><div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            <span style={chip}>Hook Pattern: {a.hookPattern}</span>
            <span style={chip}>Format: {a.format ?? a.seedPattern}</span>
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

// A hook = 4 components, in order of importance (Text > Visual > Spoken > Audio).
// The panel groups the hook-database columns into those 4 blocks so the *alignment*
// across them is legible, instead of a flat list of fields.
const HookComponentBlock: React.FC<{ order: number; title: string; note?: string; rows: [string, string][] }> = ({ order, title, note, rows }) => (
  <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '11px 12px', marginBottom: '10px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
      <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{order}</span>
      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      {note && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{note}</span>}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', color: 'var(--text-primary)' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)', minWidth: '92px', flexShrink: 0 }}>{k}</span>
          <span style={{ fontWeight: 500 }}>{v || '—'}</span>
        </div>
      ))}
    </div>
  </div>
);

const HookDetailPanel: React.FC<{ entry: HookEntry; onClose: () => void }> = ({ entry, onClose }) => {
  return (
    <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
        <Database size={14} color="var(--accent-color)" />
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Hook Alignment</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
          <X size={14} />
        </button>
      </div>

      <Section title="Spoken Hook Framework">
        <div style={{ background: 'var(--accent-light)', padding: '10px 12px', borderRadius: '8px', borderLeft: '3.5px solid var(--accent-color)', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {entry.spoken_hook_framework || entry.title}
        </div>
      </Section>

      <Section title="Actual Spoken Hook">
        <div style={{ fontStyle: 'italic', color: 'var(--text-primary)', fontSize: '12px', borderLeft: '2.5px solid var(--border-color)', paddingLeft: '10px', lineHeight: 1.5 }}>
          “{entry.actual_spoken_hook}”
        </div>
      </Section>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <Stat k="Views" v={fmtNum(entry.views)} />
        <Stat k="Rank (Top 10)" v={entry.performance ? `#${entry.performance}` : '—'} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '14px' }}>
        {entry.niche && <span style={chip}>{entry.niche}</span>}
        {entry.content_type && <span style={chip}>{entry.content_type}</span>}
      </div>

      <div style={{ ...label, marginBottom: '8px' }}>Die 4 Hook-Komponenten (nach Wichtigkeit)</div>
      <HookComponentBlock order={1} title="Text Hook" note="was du schreibst" rows={[['Word Structure', entry.text_hook_word_structure], ['Layout', entry.text_hook_layout], ['Motion', entry.text_hook_motion]]} />
      <HookComponentBlock order={2} title="Visual Hook" note="was du zeigst" rows={[['Graphic', entry.visual_hook_graphic_selection], ['Layout', entry.visual_hook_layout_structure], ['Movement', entry.visual_hook_visual_movement]]} />
      <HookComponentBlock order={3} title="Spoken Hook" note="was du sagst" rows={[['Structure', entry.spoken_hook_structure]]} />
      <HookComponentBlock order={4} title="Audio Hook" note="Musik / SFX" rows={[['Structure', entry.audio_hook_structure], ['Details', entry.audio_hook_specifics]]} />

      <div style={{ marginTop: '6px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex' }}>
        {entry.video_link && (
          <a href={entry.video_link} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Original Video ansehen <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
};

const CodexDetailPanel: React.FC<{ entry: CodexEntry; onClose: () => void }> = ({ entry, onClose }) => {
  return (
    <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
        <Sparkles size={14} color="var(--accent-color)" />
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Codex Rule Details</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
          <X size={14} />
        </button>
      </div>

      <Section title="Category">
        <span style={{ ...chip, background: 'var(--accent-light)', borderColor: 'var(--accent-color)', color: 'var(--accent-color)', fontWeight: 600 }}>{entry.category}</span>
      </Section>

      <Section title="Rule / Principle">
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '8px' }}>
          {entry.title}
        </div>
      </Section>

      <Section title="Description & Application">
        <div style={{ color: 'var(--text-primary)', fontSize: '12.5px', lineHeight: '1.6', whiteSpace: 'pre-wrap', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
          {entry.content}
        </div>
      </Section>

      <Section title="Keywords / Tags">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {entry.tags.map(t => <span key={t} style={chip}>#{t}</span>)}
        </div>
      </Section>
    </div>
  );
};

const Stat: React.FC<{ k: string; v: string; color?: string }> = ({ k, v, color }) => (
  <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>{k}</div>
    <div style={{ fontSize: '15px', fontWeight: 700, color: color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{v}</div>
  </div>
);

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
  <button
    onClick={onClick}
    style={{
      background: 'transparent', border: 'none',
      borderBottom: active ? '2.5px solid var(--accent-color)' : '2.5px solid transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s ease',
    }}
  >
    {icon}{children}
  </button>
);

// ─── Output tab (Weekly Remix Reports) ───────────────────────────────────────
//
// Every Sunday the remix cron picks the 7 most connected shorts + the 1 long
// video best connected to them, remixes them through the user's chosen AI and
// files a markdown report here. Each report is downloadable as .md.

const RemixOutputTab: React.FC = () => {
  const { reports, loading, running, runNow } = useRemixReports();
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleRun = async () => {
    setErr(null);
    const r = await runNow();
    if (!r.ok) setErr(r.error ?? 'Remix fehlgeschlagen');
  };

  const open = reports.find((r) => r.id === openId) ?? null;

  return (
    <div style={{ marginTop: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: '640px' }}>
          Jeden <strong>Sonntag um 7 Uhr</strong> sucht die KI die <strong>7 Shorts mit der höchsten Konnektivität</strong> (Topic &amp; Seed)
          plus das <strong>1 Long-Video</strong>, das am stärksten mit ihnen verbunden ist, und remixt die 8 Videos zu neuen Ideen.
          Nur Ideen, die deinen Content-Filter bestehen (≥ 6/7), landen hier und in der Idea Bank.
          KI &amp; Filter stellst du unter <em>Settings → API Providers</em> ein.
        </p>
        <button className="btn-sage-primary" onClick={handleRun} disabled={running}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '12px', flexShrink: 0, opacity: running ? 0.6 : 1 }}>
          {running ? <Loader2 size={14} className="spin" /> : <Recycle size={14} />} {running ? 'Remix läuft… (~1 Min)' : 'Jetzt generieren'}
        </button>
      </div>
      {err && <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '14px' }}>{err}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>Lade Reports…</div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
          Noch kein Report. Der erste entsteht am Sonntag um 7 Uhr — oder klicke oben auf „Jetzt generieren".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reports.map((r) => {
            const shorts = r.sources.filter((s) => s.mediaType === 'short').length;
            const longs = r.sources.filter((s) => s.mediaType === 'longform').length;
            const isOpen = r.id === openId;
            return (
              <div key={r.id} style={{ border: isOpen ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)', borderRadius: '12px', background: 'rgba(0,0,0,0.015)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
                  onClick={() => setOpenId(isOpen ? null : r.id)}>
                  <FileDown size={15} color="var(--accent-color)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Weekly Remix — {r.weekStart}</span>
                  <span style={chip}>{r.ideasCount} Ideen</span>
                  <span style={chip}>{shorts} Shorts{longs ? ` + ${longs} Long` : ''}</span>
                  {r.provider && <span style={{ ...chip, color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>{r.provider}</span>}
                  <button className="btn-sage-secondary" onClick={(e) => { e.stopPropagation(); downloadReportMarkdown(r); }}
                    style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <FileDown size={12} /> .md herunterladen
                  </button>
                </div>
                {isOpen && open && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: '16px', maxHeight: '480px', overflowY: 'auto' }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.65, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {open.markdown}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Lego Bricks tab ─────────────────────────────────────────────────────────

const BrickSelector: React.FC<{ selectedBrickId: string; onSelect: (id: string) => void; search: string; onSearch: (v: string) => void }> = ({ selectedBrickId, onSelect, search, onSearch }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <div>
      <div style={label}>Suche Optionen</div>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: '9px', top: '10px', color: 'var(--text-secondary)' }} />
        <input style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="brick option…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
    </div>
    {PRODUCTION_STAGES.filter((s) => s.brickIds.length > 0).map((stage) => (
      <div key={stage.id}>
        <div style={label}>{stage.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {stage.brickIds.map((bid) => {
            const b = brickById(bid);
            if (!b) return null;
            const active = b.id === selectedBrickId;
            return (
              <button key={bid} onClick={() => onSelect(bid)}
                style={{ textAlign: 'left', background: active ? 'var(--accent-light)' : 'transparent', border: active ? '1px solid var(--accent-color)' : '1px solid transparent', color: active ? 'var(--accent-color)' : 'var(--text-primary)', fontWeight: active ? 600 : 500, fontSize: '12.5px', padding: '6px 10px', borderRadius: '7px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                <span>{b.name}</span>
                {b.options.length > 0 && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{b.options.length}</span>}
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

const BrickOptionGrid: React.FC<{ brick: LegoBrick; options: BrickOption[]; selectedId: string | null; onSelect: (id: string) => void }> = ({ brick, options, selectedId, onSelect }) => {
  const groups: { category: string; items: BrickOption[] }[] = [];
  for (const o of options) {
    const cat = o.category ?? '';
    let g = groups.find((x) => x.category === cat);
    if (!g) { g = { category: cat, items: [] }; groups.push(g); }
    g.items.push(o);
  }
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{brick.name}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{brick.definition}</div>
        {brick.approach && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-primary)', background: 'var(--accent-light)', borderLeft: '3px solid var(--accent-color)', padding: '8px 12px', borderRadius: '8px', lineHeight: 1.5 }}>
            <strong>Ansatz:</strong> {brick.approach}
          </div>
        )}
      </div>
      {groups.map((g) => (
        <div key={g.category || 'default'} style={{ marginBottom: '18px' }}>
          {g.category && <div style={{ ...label, marginBottom: '8px' }}>{g.category}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {g.items.map((o) => (
              <div key={o.id} onClick={() => onSelect(o.id)}
                style={{ border: o.id === selectedId ? '2px solid var(--accent-color)' : '1px solid var(--border-color)', background: o.id === selectedId ? 'var(--accent-light)' : 'rgba(0,0,0,0.015)', borderRadius: '10px', padding: '12px', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '5px' }}>{o.name}</div>
                {(o.description || o.startingPoint) && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {o.description ?? o.startingPoint}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const BrickOptionDetail: React.FC<{ brick: LegoBrick; option: BrickOption; onClose: () => void }> = ({ brick, option, onClose }) => (
  <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
      <Blocks size={14} color="var(--accent-color)" />
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{brick.name}</span>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
        <X size={14} />
      </button>
    </div>
    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '6px' }}>{option.name}</div>
    {option.category && <span style={{ ...chip, background: 'var(--accent-light)', borderColor: 'var(--accent-color)', color: 'var(--accent-color)', fontWeight: 600 }}>{option.category}</span>}
    <div style={{ marginTop: '14px' }}>
      {option.description && <Section title="Definition">{option.description}</Section>}
      {option.startsWith && <Section title="Startet mit">{option.startsWith}</Section>}
      {option.startingPoint && <Section title="Starting Point">{option.startingPoint}</Section>}
      {option.coreMechanism && <Section title="Core Mechanism">{option.coreMechanism}</Section>}
      {option.example && (
        <Section title="Beispiel">
          <div style={{ fontStyle: 'italic', borderLeft: '2.5px solid var(--border-color)', paddingLeft: '10px', lineHeight: 1.5 }}>“{option.example}”</div>
        </Section>
      )}
      {option.storyStructure && option.storyStructure.length > 0 && (
        <Section title="Story Structure">
          <ol style={{ margin: 0, paddingLeft: '18px' }}>{option.storyStructure.map((s, i) => <li key={i} style={{ marginBottom: '5px', lineHeight: 1.45 }}>{s}</li>)}</ol>
        </Section>
      )}
    </div>
  </div>
);

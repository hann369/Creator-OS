import React from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useIdentity } from '../hooks/useIdentity.js';
import { useMoodboards } from '../hooks/useMoodboards.js';
import { fontStack, loadFont } from '../lib/fonts.js';

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: '28px' }}>
    <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '12px' }}>{label}</div>
    {children}
  </div>
);

export const IdentityView: React.FC = () => {
  const { identities, activeIdentity, setActiveId, derive, isLoading, isDeriving, error } = useIdentity();
  const { boards } = useMoodboards();

  const onDerive = () => { void derive(boards); };

  // Ensure the identity's fonts are loaded for the preview.
  React.useEffect(() => {
    if (!activeIdentity) return;
    loadFont(activeIdentity.typography.heading);
    loadFont(activeIdentity.typography.body);
    loadFont(activeIdentity.typography.accent);
  }, [activeIdentity?.typography.heading, activeIdentity?.typography.body, activeIdentity?.typography.accent]);

  return (
    <div className="view-body" style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <span className="label-mono">Brand</span>
          <h1 className="title-serif" style={{ fontSize: '36px', color: 'var(--text-primary)', marginTop: '4px' }}>Identity</h1>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            Synthesized from this project's moodboards — the layer that styles content and learns from performance.
          </p>
        </div>
        <button
          className="btn-sage-primary"
          onClick={onDerive}
          disabled={isDeriving || boards.length === 0}
          style={{ padding: '9px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          {activeIdentity ? <RefreshCw size={13} /> : <Sparkles size={13} />}
          {isDeriving ? 'Deriving…' : activeIdentity ? 'Re-derive' : 'Derive from Moodboards'}
        </button>
      </div>

      {error && <div style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '16px' }}>{error}</div>}

      {/* Identity switcher */}
      {identities.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {identities.map(i => (
            <button key={i.id} onClick={() => setActiveId(i.id)} className="label-mono"
              style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '99px', border: '1px solid var(--border-color)', cursor: 'pointer',
                background: i.id === activeIdentity?.id ? 'var(--accent-light)' : 'transparent',
                color: i.id === activeIdentity?.id ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
              {i.title}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading…</p>
      ) : !activeIdentity ? (
        <div style={{ border: '1px dashed var(--border-color)', borderRadius: '14px', padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '6px' }}>No brand identity yet.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 20px', lineHeight: 1.6 }}>
            {boards.length === 0
              ? 'Create or import a moodboard first — the identity is synthesized from your boards.'
              : `Derive an identity from your ${boards.length} moodboard${boards.length === 1 ? '' : 's'} (colors, typography, voice & hooks).`}
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{activeIdentity.title}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '28px' }}>
            fed by {activeIdentity.moodboardIds.length} moodboard{activeIdentity.moodboardIds.length === 1 ? '' : 's'}
          </div>

          <Section label="COLORS">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {activeIdentity.colors.length > 0 ? activeIdentity.colors.map((c, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: c.hex, border: '1px solid rgba(0,0,0,0.1)' }} title={c.hex} />
                  <div style={{ fontSize: '8px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>{c.hex}</div>
                </div>
              )) : <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>—</span>}
            </div>
          </Section>

          <Section label="TYPOGRAPHY">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {([['Heading', activeIdentity.typography.heading], ['Body', activeIdentity.typography.body], ['Accent', activeIdentity.typography.accent]] as const).map(([role, fam]) => (
                <div key={role} style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', width: '60px' }}>{role}</span>
                  <span style={{ fontSize: '20px', color: 'var(--text-primary)', fontFamily: fontStack(fam) }}>{fam || '—'}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section label="VOICE">
            {activeIdentity.voice.tone && <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontStyle: 'italic', marginBottom: '12px' }}>“{activeIdentity.voice.tone}”</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--accent-color)', fontWeight: 700, marginBottom: '6px' }}>DO</div>
                {activeIdentity.voice.doList.length ? activeIdentity.voice.doList.map((d, i) => (
                  <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>+ {d}</div>
                )) : <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>—</span>}
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 700, marginBottom: '6px' }}>DON'T</div>
                {activeIdentity.voice.dontList.length ? activeIdentity.voice.dontList.map((d, i) => (
                  <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>− {d}</div>
                )) : <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>—</span>}
              </div>
            </div>
          </Section>

          <Section label="HOOKS (ranked)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeIdentity.hooks.length ? activeIdentity.hooks.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', padding: '8px 12px', background: 'rgba(15,90,71,0.04)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--accent-color)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{i + 1}</span>
                  {h}
                </div>
              )) : <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Noch keine Hooks — kommen aus der AI-Synthese oder dem Learning-Loop.</span>}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};

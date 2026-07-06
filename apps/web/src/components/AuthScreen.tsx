import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

// Calm, editorial login gate — matches the anti-dashboard aesthetic. Supports
// password sign-in/sign-up and a passwordless magic link.

const inputStyle: React.CSSProperties = {
  fontSize: '14px', border: '1px solid var(--border-color)', padding: '11px 14px',
  borderRadius: '10px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box',
};

type Mode = 'signin' | 'signup';

export const AuthScreen: React.FC = () => {
  const { signIn, signUp, sendMagicLink } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) { setError('E-Mail und Passwort erforderlich.'); return; }
    setBusy(true); setError(null); setMessage(null);
    const res = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (mode === 'signup' && 'needsConfirmation' in res && res.needsConfirmation) {
      setMessage('Fast fertig — bestätige deine E-Mail, dann kannst du dich anmelden.');
    }
    // On success with an active session, AuthProvider swaps the screen automatically.
  };

  const magicLink = async () => {
    if (!email.trim()) { setError('Gib deine E-Mail ein, dann schicke ich dir einen Link.'); return; }
    setBusy(true); setError(null); setMessage(null);
    const res = await sendMagicLink(email.trim());
    setBusy(false);
    if (res.error) setError(res.error);
    else setMessage('Magic Link unterwegs — schau in dein Postfach.');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '28px' }}>
          <img src="/logo.png" alt="Pronoia" style={{ height: '24px', mixBlendMode: 'multiply', objectFit: 'contain' }} />
        </div>
        <h1 className="title-serif" style={{ fontSize: '32px', color: 'var(--text-primary)', margin: '0 0 6px' }}>
          {mode === 'signin' ? 'Welcome back.' : 'Create your space.'}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>
          {mode === 'signin' ? 'Melde dich an, um zu deinen Projekten zu gelangen.' : 'Ein Konto, in dem dein Wissensgraph dir gehört.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input style={inputStyle} type="email" placeholder="E-Mail" value={email} autoFocus
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          <input style={inputStyle} type="password" placeholder="Passwort" value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        </div>

        {error && <p style={{ fontSize: '12px', color: '#c0392b', margin: '14px 0 0' }}>{error}</p>}
        {message && <p style={{ fontSize: '12px', color: 'var(--accent-color)', margin: '14px 0 0', lineHeight: 1.5 }}>{message}</p>}

        <button className="btn-sage-primary" onClick={submit} disabled={busy}
          style={{ width: '100%', padding: '12px', marginTop: '20px', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Einen Moment…' : mode === 'signin' ? 'Anmelden' : 'Konto erstellen'}
        </button>

        <button onClick={magicLink} disabled={busy}
          style={{ width: '100%', padding: '10px', marginTop: '10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Stattdessen Magic Link senden
        </button>

        <div style={{ marginTop: '22px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {mode === 'signin' ? 'Noch kein Konto?' : 'Schon registriert?'}{' '}
          <span onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setMessage(null); }}
            style={{ color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600 }}>
            {mode === 'signin' ? 'Konto erstellen' : 'Anmelden'}
          </span>
        </div>
      </div>
    </div>
  );
};

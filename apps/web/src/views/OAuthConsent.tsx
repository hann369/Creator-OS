import React, { useState, useEffect } from 'react';
import { ShieldCheck, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.js';

export const OAuthConsent: React.FC = () => {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);

  const queryParams = new URLSearchParams(window.location.search);
  const authorizationId = queryParams.get('authorization_id');

  useEffect(() => {
    if (!authorizationId) {
      setError('Fehlender authorization_id Parameter. OAuth-Flow kann nicht initiiert werden.');
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        const authClient = (supabase.auth as any).oauth;
        if (!authClient || typeof authClient.getAuthorizationDetails !== 'function') {
          throw new Error('OAuth Server-Funktionalität wird von dieser Version des Supabase-Clients nicht unterstützt.');
        }

        const { data, error: err } = await authClient.getAuthorizationDetails(authorizationId);

        if (err) {
          throw err;
        }

        if (data && 'redirect_url' in data) {
          // Der User hat bereits zugestimmt – direkt weiterleiten
          window.location.href = data.redirect_url;
          return;
        }

        setDetails(data);
      } catch (err: any) {
        console.error('Fehler beim Laden der OAuth-Details:', err);
        setError(err.message || 'Details der Autorisierungsanfrage konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [authorizationId]);

  const handleApprove = async () => {
    if (!authorizationId || actionLoading) return;
    setActionLoading('approve');
    try {
      const authClient = (supabase.auth as any).oauth;
      const { data, error: err } = await authClient.approveAuthorization(authorizationId);
      if (err) throw err;
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        throw new Error('Keine Weiterleitungs-URL erhalten.');
      }
    } catch (err: any) {
      console.error('Fehler bei der Freigabe:', err);
      setError(err.message || 'Die Autorisierung konnte nicht freigegeben werden.');
      setActionLoading(null);
    }
  };

  const handleDeny = async () => {
    if (!authorizationId || actionLoading) return;
    setActionLoading('deny');
    try {
      const authClient = (supabase.auth as any).oauth;
      const { data, error: err } = await authClient.denyAuthorization(authorizationId);
      if (err) throw err;
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        throw new Error('Keine Weiterleitungs-URL erhalten.');
      }
    } catch (err: any) {
      console.error('Fehler beim Ablehnen:', err);
      setError(err.message || 'Die Ablehnung konnte nicht verarbeitet werden.');
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'radial-gradient(circle at top left, #f8f9fa, #e9ecef)' }}>
        <Loader2 className="animate-spin" size={48} color="var(--accent-color)" />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500 }}>Prüfe Autorisierungsdetails...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '20px', background: 'radial-gradient(circle at top left, #f8f9fa, #e9ecef)' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #f5c6cb', borderRadius: 'var(--radius-lg)', padding: '32px', maxWidth: '480px', width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <AlertTriangle size={48} color="#c0392b" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#2c3e50', marginBottom: '12px' }}>Verbindungsfehler</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>{error}</p>
          <button className="btn-sage-secondary" style={{ width: '100%', padding: '12px' }} onClick={() => window.location.reload()}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  const clientName = details?.client_name || 'Drittanbieter-App';
  const clientWebsite = details?.client_metadata?.website || '';
  const clientLogo = details?.client_metadata?.logo_url || '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px', background: 'radial-gradient(circle at top left, #f8f9fa, #e9ecef)' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '40px', maxWidth: '500px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}>
        
        {/* Brand/Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ background: 'var(--accent-light)', width: '64px', height: '64px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: 'var(--accent-color)', boxShadow: '0 4px 12px rgba(var(--accent-color-rgb), 0.1)' }}>
            {clientLogo ? (
              <img src={clientLogo} alt={clientName} style={{ width: '100%', height: '100%', borderRadius: '20px', objectFit: 'cover' }} />
            ) : (
              <ShieldCheck size={32} />
            )}
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#1a1d20', textAlign: 'center', margin: 0 }}>
            Verbindung anfordern
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', marginTop: '6px', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>{clientName}</span> möchte sich mit deinem <strong>Creator OS</strong> verbinden.
          </p>
        </div>

        {/* User Account Info */}
        <div style={{ background: '#f8f9fa', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', fontSize: '13px' }}>
          <div>
            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Angemeldet als</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user?.email}</span>
          </div>
          <button 
            onClick={() => void signOut().then(() => window.location.reload())}
            style={{ border: 'none', background: 'none', color: '#c0392b', fontWeight: 600, fontSize: '12px', cursor: 'pointer', padding: '4px' }}
          >
            Konto wechseln
          </button>
        </div>

        {/* Scope Permissions */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Diese App erhält folgende Rechte:
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ background: '#e1f5fe', color: '#0288d1', padding: '6px', borderRadius: '50%', display: 'flex' }}>
                <Check size={14} />
              </div>
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'block' }}>Creator OS Daten lesen</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                  Lesezugriff auf deine Ideenbank, deine Ziele, deinen Workspace und deine Video-Bibliothek.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ background: '#e1f5fe', color: '#0288d1', padding: '6px', borderRadius: '50%', display: 'flex' }}>
                <Check size={14} />
              </div>
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'block' }}>Content-Pipeline einsehen</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                  Ermöglicht der App, den Status und die Notizen deiner Produktionskarten abzufragen.
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button 
            className="btn-sage-primary" 
            style={{ width: '100%', padding: '14px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={handleApprove}
            disabled={!!actionLoading}
          >
            {actionLoading === 'approve' ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            Zulassen & Verbinden
          </button>
          
          <button 
            className="btn-sage-secondary" 
            style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={handleDeny}
            disabled={!!actionLoading}
          >
            {actionLoading === 'deny' && <Loader2 className="animate-spin" size={16} />}
            Ablehnen
          </button>
        </div>

        {/* Footer info */}
        {clientWebsite && (
          <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '24px', margin: '24px 0 0' }}>
            Du wirst weitergeleitet an: <a href={clientWebsite} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 600 }}>{clientWebsite}</a>
          </p>
        )}

      </div>
    </div>
  );
};

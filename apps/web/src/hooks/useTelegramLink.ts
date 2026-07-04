import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// Talks to the Creator OS Telegram endpoints (apps/api). All calls carry the
// Supabase access token so the server can resolve the user. "Connect" either
// links instantly (id reused from the ecosystem) or returns a one-time code to
// send the bot as `/link <code>`.

interface ConnectResult {
  linked: boolean;
  code?: string;
  expiresAt?: string;
  botUsername?: string | null;
  source?: string;
  username?: string | null;
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
}

export function useTelegramLink() {
  const [linked, setLinked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setLinked(!!data.linked);
        setUsername(data.username ?? null);
      }
    } catch { /* offline — leave state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = useCallback(async () => {
    setError(null); setCode(null);
    try {
      const res = await authFetch('/api/v1/telegram/connect', { method: 'POST' });
      const data: ConnectResult = await res.json().catch(() => ({ linked: false }));
      if (!res.ok) { setError((data as any).error || `Fehler ${res.status}`); return; }
      if (data.linked) { setLinked(true); setUsername(data.username ?? username); return; }
      setCode(data.code ?? null);
      setBotUsername(data.botUsername ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Verbindung fehlgeschlagen');
    }
  }, [username]);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      const res = await authFetch('/api/v1/telegram/disconnect', { method: 'POST' });
      if (res.ok) { setLinked(false); setUsername(null); setCode(null); }
    } catch (e: any) { setError(e?.message ?? 'Trennen fehlgeschlagen'); }
  }, []);

  return { linked, username, code, botUsername, loading, error, connect, disconnect, refresh };
}

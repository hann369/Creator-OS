import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Weekly Remix output + settings.
//
// Reports are read straight from remix_reports under RLS (like useLibrary reads
// content_entries); the actual remix run happens server-side (Sunday cron, or
// the authed POST /api/v1/remix/run for a manual "Jetzt generieren").
// Settings live in remix_settings (one row per user) — the server cron reads
// them to know WHICH AI answers (Gemini with the user's key, Mistral fallback)
// and which content filter gates the ideas.

export interface RemixReportSource {
  id: string;
  title: string;
  url: string;
  mediaType: string;
  connectivity: number;
}

export interface RemixReport {
  id: string;
  weekStart: string;
  provider: string;
  sources: RemixReportSource[];
  ideasCount: number;
  markdown: string;
  createdAt: Date;
}

export interface RemixSettingsRow {
  provider: 'gemini' | 'mistral';
  geminiApiKey: string;
  contentFilter: string;
  minFilterScore: number;
}

export function useRemixReports() {
  const [reports, setReports] = useState<RemixReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('remix_reports')
      .select('id, week_start, provider, sources, ideas_count, markdown, created_at')
      .order('week_start', { ascending: false });
    if (!error && data) {
      setReports(data.map((r: any) => ({
        id: r.id,
        weekStart: r.week_start ?? '',
        provider: r.provider ?? '',
        sources: Array.isArray(r.sources) ? r.sources : [],
        ideasCount: r.ideas_count ?? 0,
        markdown: r.markdown ?? '',
        createdAt: new Date(r.created_at ?? Date.now()),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Manual run for the signed-in creator ("Jetzt generieren"). */
  const runNow = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: 'Not signed in' };
    setRunning(true);
    try {
      const res = await fetch('/api/v1/remix/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: body.error ?? `Remix fehlgeschlagen (${res.status})` };
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    } finally {
      setRunning(false);
    }
  }, [refresh]);

  return { reports, loading, running, refresh, runNow };
}

/** Trigger a browser download of a report as a .md file. */
export function downloadReportMarkdown(report: RemixReport): void {
  const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weekly-remix-${report.weekStart || report.id}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useRemixSettings() {
  const [settings, setSettings] = useState<RemixSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('remix_settings')
        .select('provider, gemini_api_key, content_filter, min_filter_score')
        .maybeSingle();
      if (data) {
        setSettings({
          provider: data.provider === 'mistral' ? 'mistral' : 'gemini',
          geminiApiKey: data.gemini_api_key ?? '',
          contentFilter: data.content_filter ?? '',
          minFilterScore: data.min_filter_score ?? 6,
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = useCallback(async (next: RemixSettingsRow): Promise<{ ok: boolean; error?: string }> => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return { ok: false, error: 'Not signed in' };
    const { error } = await supabase.from('remix_settings').upsert({
      owner_id: userId,
      provider: next.provider,
      gemini_api_key: next.geminiApiKey || null,
      content_filter: next.contentFilter || null,
      min_filter_score: next.minFilterScore,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id' });
    if (error) return { ok: false, error: error.message };
    setSettings(next);
    return { ok: true };
  }, []);

  return { settings, loading, save };
}

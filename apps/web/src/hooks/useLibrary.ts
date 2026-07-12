import { useCallback, useEffect, useState } from 'react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { supabase } from '../lib/supabase.js';
import { fetchTranscriptFromBrowser } from '../lib/transcriptFetch.js';


// The Library store — imported short-form content + its AI analysis. This is a
// READ-ONLY view hook: reads come straight from content_entries via RLS; writes
// happen server-side (the ingestion pipeline). We deliberately do NOT reuse
// createCollection here because its write-back mirror would clobber the rich
// server-only columns (comments/metadata/embedding) that the UI never sends.

export interface LibVideoAnalysis {
  topic: string; subTopics: string[]; seed: string; format?: string; seedPattern: string; substance?: string; hook: string; hookPattern: string;
  mechanism: string; audience: string; problem: string; promise: string; cta: string;
  storyStructure: string; editingStyle: string; visualStyle: string; emotion: string; novelty: string;
  retentionTechniques: string[]; actionableTakeaways: string[]; claims: string[];
  scientificReferences: string[]; confidence: number;
}

export interface LibEntry {
  id: string;
  workspaceId: string;
  platform: string;
  creator: string;
  url: string;
  canonicalUrl: string;
  /** Import-Tagging: 'short' (YouTube Shorts, Instagram Reels) | 'longform' (normale YouTube-Videos) | … */
  mediaType: string;
  title: string;
  thumbnail?: string;
  transcript: string;
  comments: { author?: string; text: string }[];
  statistics: { views: number; likes: number; comments: number; shares: number };
  analysis?: LibVideoAnalysis;
  outlier?: { outlierScore: number; engagementScore: number; velocityScore: number; label: string };
  status: string;
  error?: string;
  createdAt: Date;
}

function rowToEntry(r: any): LibEntry {
  return {
    id: r.id,
    workspaceId: r.workspace_id ?? getActiveWorkspaceId(),
    platform: r.platform ?? 'youtube',
    creator: r.creator ?? '',
    url: r.url ?? '',
    canonicalUrl: r.canonical_url ?? '',
    mediaType: r.media_type ?? 'short',
    title: r.title ?? '',
    thumbnail: r.thumbnail ?? undefined,
    transcript: r.transcript ?? '',
    comments: r.comments ?? [],
    statistics: r.statistics ?? { views: 0, likes: 0, comments: 0, shares: 0 },
    analysis: r.analysis ?? undefined,
    outlier: r.outlier ?? undefined,
    status: r.status ?? 'completed',
    error: r.error ?? undefined,
    createdAt: new Date(r.created_at ?? Date.now()),
  };
}

export function useLibrary() {
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('content_entries')
      .select('*')
      .eq('workspace_id', getActiveWorkspaceId())
      .order('created_at', { ascending: false });
    if (!error && data) setEntries(data.map(rowToEntry));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Automatically backfill transcripts via browser client-side fetch when YouTube cloud-IP is blocked
  useEffect(() => {
    const youtubeEntriesMissingTranscript = entries.filter(
      (e) => e.platform === 'youtube' && e.status === 'completed' && !e.transcript && !fetchingIds.has(e.id)
    );

    if (youtubeEntriesMissingTranscript.length === 0) return;

    youtubeEntriesMissingTranscript.forEach(async (entry) => {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.add(entry.id);
        return next;
      });

      console.log(`[useLibrary] Attempting browser-side transcript fetch for ${entry.id} (${entry.url})`);
      const browserTranscript = await fetchTranscriptFromBrowser(entry.url);
      
      if (!browserTranscript) {
        console.log(`[useLibrary] Browser-side transcript fetch failed or returned empty for ${entry.id}`);
        return;
      }

      console.log(`[useLibrary] Got transcript browser-side (${browserTranscript.length} chars). Patching to server...`);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      try {
        const patchRes = await fetch(`/api/v1/library/${entry.id}/transcript`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ transcript: browserTranscript }),
        });
        if (patchRes.ok) {
          console.log(`[useLibrary] Successfully patched transcript for ${entry.id}`);
          void refresh();
        } else {
          console.error(`[useLibrary] Failed to patch transcript for ${entry.id}: status ${patchRes.status}`);
        }
      } catch (err) {
        console.error(`[useLibrary] Error patching transcript for ${entry.id}:`, err);
      }
    });
  }, [entries, fetchingIds, refresh]);

  const ingest = useCallback(async (url: string): Promise<{ ok: boolean; entryId?: string; error?: string }> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: 'Not signed in' };
    try {
      const res = await fetch('/api/v1/library/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, workspaceId: getActiveWorkspaceId() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: body.error ?? `Ingest failed (${res.status})` };
      return { ok: true, entryId: body.entryId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  const deleteEntry = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('content_entries').delete().eq('id', id);
      if (error) return { ok: false, error: error.message };
      setEntries((prev) => prev.filter((e) => e.id !== id));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, []);

  return { entries, loading, refresh, ingest, deleteEntry };
}

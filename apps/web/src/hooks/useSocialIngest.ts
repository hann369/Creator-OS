import { useState, useCallback } from 'react';
import type { ContentMetrics } from '@pronoia/domain';

// Client for the social-analytics ingest endpoint. Credential-free scaffold: if
// the server has no API key it returns 501 { needsCredentials }, which we surface
// as a friendly "connect your account" state rather than an error.

export type SocialPlatform = 'youtube' | 'instagram';

interface IngestResult {
  metrics: ContentMetrics;
  post: { id: string; title?: string };
}

export function useSocialIngest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCredentials, setNeedsCredentials] = useState<SocialPlatform | null>(null);

  const ingest = useCallback(async (platform: SocialPlatform, postId: string): Promise<IngestResult | null> => {
    setLoading(true); setError(null); setNeedsCredentials(null);
    try {
      const res = await fetch('/api/v1/social/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, postId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 501 && data.needsCredentials) {
        setNeedsCredentials(platform);
        return null;
      }
      if (!res.ok) throw new Error(data.error || `Ingest ${res.status}`);
      return data as IngestResult;
    } catch (e: any) {
      setError(e?.message ?? 'Ingest failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ingest, loading, error, needsCredentials };
}

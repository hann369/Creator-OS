import { useState, useCallback } from 'react';
import type { Moodboard, BoardFonts } from '@pronoia/domain';
import { FONT_OPTIONS } from '../lib/fonts.js';

// A5: defaults when AI guesses a font that isn't in FONT_OPTIONS
const DEFAULT_FONTS: BoardFonts = { title: 'Anton', subheading: 'Archivo', caption: 'Space Grotesk' };

/**
 * Map an AI-guessed font family to the nearest loadable FONT_OPTIONS entry.
 * Tries exact match (case-insensitive), then falls back to the supplied default.
 */
function nearestFont(guess: string | undefined, fallback: string): string {
  if (!guess) return fallback;
  const lower = guess.toLowerCase();
  return FONT_OPTIONS.find(f => f.toLowerCase() === lower) ?? fallback;
}

export function useBrandDna() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Moodboard | null>(null);

  const extractBrandDna = useCallback(async (url: string, workspaceId: string) => {
    setIsLoading(true);
    setError(null);
    setPreview(null);
    try {
      const response = await fetch('/api/v1/brand-dna/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, workspaceId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.moodboard) {
        throw new Error('Invalid response structure from Brand DNA API');
      }

      const mb: Moodboard = data.moodboard;
      // Convert date strings back to Dates
      mb.createdAt = new Date(mb.createdAt);
      mb.updatedAt = new Date(mb.updatedAt);

      // A5: remap AI-guessed fonts to loadable Google Fonts from FONT_OPTIONS.
      // Preserve original AI guess in notes for transparency.
      const rawFonts = mb.fonts;
      const mappedTitle = nearestFont(rawFonts?.title, DEFAULT_FONTS.title);
      const mappedSub = nearestFont(rawFonts?.subheading, DEFAULT_FONTS.subheading);
      const mappedCaption = nearestFont(rawFonts?.caption, DEFAULT_FONTS.caption);

      mb.fonts = { title: mappedTitle, subheading: mappedSub, caption: mappedCaption };

      // Append raw AI guess to notes so the user can see what the AI originally suggested
      const aiGuess = `${rawFonts?.title ?? '?'} / ${rawFonts?.subheading ?? '?'} / ${rawFonts?.caption ?? '?'}`;
      if (aiGuess !== `${mappedTitle} / ${mappedSub} / ${mappedCaption}`) {
        mb.notes = (mb.notes ?? '') + ` · AI fonts: ${aiGuess}`;
      }

      setPreview(mb);
      return mb;
    } catch (err: any) {
      const msg = err.message || 'Failed to extract Brand DNA';
      setError(msg);
      console.error('[useBrandDna] extraction error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  return { extractBrandDna, isLoading, error, preview, clearPreview };
}

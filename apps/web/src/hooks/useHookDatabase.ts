import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export interface HookEntry {
  id: string;
  workspaceId: string;
  title: string;
  spoken_hook_structure: string;
  video_link: string;
  text_hook_layout: string;
  views: number;
  visual_hook_graphic_selection: string;
  audio_hook_structure: string;
  visual_hook_layout_structure: string;
  text_hook_motion: string;
  audio_hook_specifics: string;
  content_type: string;
  visual_hook_visual_movement: string;
  text_hook_word_structure: string;
  performance: string;
  actual_spoken_hook: string;
  niche: string;
  spoken_hook_framework: string;
  created_at: string;
}

export function useHookDatabase() {
  const [entries, setEntries] = useState<HookEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hook_database')
      .select('*')
      .order('views', { ascending: false }); // Sort by views to see high-performers first
    
    if (!error && data) {
      setEntries(data as HookEntry[]);
    } else if (error) {
      console.error('[useHookDatabase] Error fetching hook database:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, loading, refresh };
}

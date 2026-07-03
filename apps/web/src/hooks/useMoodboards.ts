import { useState, useEffect, useCallback } from 'react';
import type { Moodboard, MoodboardItem, MoodSection, BoardType, BoardFonts, Ratio } from '@pronoia/domain';
import { entityStore, loadBoardsLocal, persistBoardsLocal } from '../lib/entityStore.js';
import { getActiveWorkspaceId, isDefaultWorkspace } from '../lib/workspace.js';

export type MoodboardStatus = Moodboard['status'];

export const BOARD_TYPES: { type: BoardType; label: string }[] = [
  { type: 'video_brand_deck', label: 'Video Brand Deck' },
  { type: 'website_branding', label: 'Website Branding' },
  { type: 'short_form', label: 'Short-Form Content' },
  { type: 'writing', label: 'Writing Content' },
  { type: 'custom', label: 'Custom' }
];

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

const DEFAULT_FONTS: BoardFonts = { title: 'Anton', subheading: 'Archivo', caption: 'Space Grotesk' };

// ─── Per-type templates (default sections) ───────────────────────────────────
function templateSections(type: BoardType): MoodSection[] {
  const t = (title: string, items: MoodboardItem[]): MoodSection => ({ id: uid('sec'), title, items });
  const txt = (label: string, ratio: Ratio, caption?: string): MoodboardItem => ({ id: uid('mi'), kind: 'text', ratio, label, caption });
  const col = (label: string, color: string, ratio: Ratio, caption?: string): MoodboardItem => ({ id: uid('mi'), kind: 'color', color, ratio, label, caption });

  switch (type) {
    case 'video_brand_deck':
      return [
        t('Thumbnails & Captions', [
          txt('Thumbnail (Grid)', '9:16', 'THE AUTOSTORE SOLUTION'),
          txt('Thumbnail (Reel)', '9:16', 'FULL BREAKDOWN'),
          txt('Caption Style — Regular', '9:16', 'Stop making these mistakes'),
          txt('Caption Style — Large', '9:16', "DON'T SELL — DELIVER"),
          txt('Animation Style', '9:16', 'IN-HOME DELIVERY')
        ]),
        t('Palette & Layouts', [
          col('Orange', '#E5591F', '1:1', 'ENERGY / SELF DRIVEN'),
          col('Neutral', '#E7E4DE', '1:1', 'DETAIL'),
          col('Black', '#111111', '16:9', 'AUTHORITY'),
          txt('Split Screen', '9:16', 'Amazon warehouse context'),
          txt('Pointers + Split', '9:16', 'MISSING THE BRIEF'),
          txt('End Screen', '9:16', 'THANKS FOR WATCHING')
        ])
      ];
    case 'website_branding':
      return [
        t('Pages', [txt('Landing', '16:9'), txt('About', '16:9'), txt('Product', '16:9')]),
        t('Palette & Type', [col('Primary', '#1E3A8A', '1:1'), col('Accent', '#00E5FF', '1:1'), col('Ink', '#0A0E17', '16:9')])
      ];
    case 'short_form':
      return [
        t('Hooks', [txt('Hook A', '9:16'), txt('Hook B', '9:16'), txt('Hook C', '9:16')]),
        t('Caption Styles', [txt('Bold Center', '9:16'), txt('Karaoke', '9:16')]),
        t('Palette', [col('Accent', '#E5591F', '1:1'), col('Base', '#111111', '1:1')])
      ];
    case 'writing':
      return [
        t('Voice & Structure', [txt('Tone', '16:9', 'Direct, calm, imperative'), txt('Hook Structure', '16:9')]),
        t('References', [txt('Reference A', '16:9'), txt('Reference B', '16:9')])
      ];
    default:
      return [t('Section', [])];
  }
}

// ─── Seed: a Video Brand Deck matching the reference ─────────────────────────
const SEED: Moodboard[] = [
  {
    id: 'mb-video-brand',
    workspaceId: getActiveWorkspaceId(),
    type: 'moodboard',
    boardType: 'video_brand_deck',
    client: 'Youssif Salameh',
    title: 'Video Brand Deck',
    subtitle: 'Video Brand Deck',
    note: 'These are just mockups, not the actual video. You can judge it more accurately when you review the first sample.',
    description: 'Visual direction for high-trust, educational YouTube content around systems, operations, and mindset.',
    tags: ['YouTube', 'Branding', 'Thumbnail Style', 'Captions'],
    palette: [
      { hex: '#E5591F' },
      { hex: '#111111' },
      { hex: '#E7E4DE' },
      { hex: '#9A9A9A' }
    ],
    fonts: { title: 'Anton', subheading: 'Archivo', caption: 'Space Grotesk' },
    status: 'draft',
    sections: templateSections('video_brand_deck'),
    notes: 'Consistent typography, high contrast, industrial, honest, direct communication.',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {}
  }
];

// ─── Backward-compatible normalisation moved to entityStore ────────────────────

export function useMoodboards() {
  const [boards, setBoards] = useState<Moodboard[]>(() => {
    const local = loadBoardsLocal();
    if (local.length > 0) return local;
    return isDefaultWorkspace() ? SEED : []; // demo board only in the default project
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await entityStore.list<Moodboard>('moodboard', getActiveWorkspaceId());
        if (!cancelled) {
          if (data.length > 0) {
            setBoards(data);
          } else if (isDefaultWorkspace()) {
            // Seed the demo board only in the default project.
            for (const b of SEED) {
              await entityStore.upsert(b);
            }
            setBoards(SEED);
          } else {
            setBoards([]);
          }
        }
      } catch (err) {
        console.warn('Failed to load moodboards from entityStore, keeping local:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const mutate = useCallback((id: string, fn: (b: Moodboard) => Moodboard) => {
    setBoards(prev => {
      const next = prev.map(b => b.id === id ? { ...fn(b), updatedAt: new Date() } : b);
      persistBoardsLocal(next);
      const updated = next.find(b => b.id === id);
      if (updated) {
        entityStore.upsert(updated).catch(err => console.warn('entityStore.upsert failed in mutate:', err));
      }
      return next;
    });
  }, []);

  const createBoard = useCallback((title: string, boardType: BoardType = 'custom'): string => {
    const b: Moodboard = {
      id: uid('mb'),
      workspaceId: getActiveWorkspaceId(),
      type: 'moodboard',
      boardType,
      client: title,
      title,
      subtitle: BOARD_TYPES.find(t => t.type === boardType)?.label ?? '',
      note: '',
      description: '',
      tags: [],
      palette: [],
      fonts: { ...DEFAULT_FONTS },
      status: 'draft',
      sections: templateSections(boardType),
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {}
    };
    setBoards(prev => { const next = [...prev, b]; persistBoardsLocal(next); return next; });
    entityStore.upsert(b).catch(err => console.warn('entityStore.upsert failed in createBoard:', err));
    return b.id;
  }, []);

  const addMoodboard = useCallback((b: Moodboard) => {
    setBoards(prev => {
      if (prev.some(x => x.id === b.id)) return prev;
      const next = [...prev, b];
      persistBoardsLocal(next);
      return next;
    });
    entityStore.upsert(b).catch(err => console.warn('entityStore.upsert failed in addMoodboard:', err));
  }, []);

  const updateBoard = useCallback((id: string, patch: Partial<Moodboard>) => {
    mutate(id, b => ({ ...b, ...patch }));
  }, [mutate]);

  const deleteBoard = useCallback((id: string) => {
    setBoards(prev => { const next = prev.filter(b => b.id !== id); persistBoardsLocal(next); return next; });
    entityStore.remove(id).catch(err => console.warn('entityStore.remove failed in deleteBoard:', err));
  }, []);

  const addSection = useCallback((boardId: string, title: string) => {
    mutate(boardId, b => ({ ...b, sections: [...b.sections, { id: uid('sec'), title, items: [] }] }));
  }, [mutate]);

  const updateSection = useCallback((boardId: string, sectionId: string, patch: Partial<MoodSection>) => {
    mutate(boardId, b => ({ ...b, sections: b.sections.map(s => s.id === sectionId ? { ...s, ...patch } : s) }));
  }, [mutate]);

  const deleteSection = useCallback((boardId: string, sectionId: string) => {
    mutate(boardId, b => ({ ...b, sections: b.sections.filter(s => s.id !== sectionId) }));
  }, [mutate]);

  const addItem = useCallback((boardId: string, sectionId: string, item: Omit<MoodboardItem, 'id'>) => {
    const full: MoodboardItem = { ...item, id: uid('mi') } as MoodboardItem;
    mutate(boardId, b => ({ ...b, sections: b.sections.map(s => s.id === sectionId ? { ...s, items: [...s.items, full] } : s) }));
  }, [mutate]);

  const deleteItem = useCallback((boardId: string, sectionId: string, itemId: string) => {
    mutate(boardId, b => ({ ...b, sections: b.sections.map(s => s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s) }));
  }, [mutate]);

  return { boards, isLoading, createBoard, addMoodboard, updateBoard, deleteBoard, addSection, updateSection, deleteSection, addItem, deleteItem };
}

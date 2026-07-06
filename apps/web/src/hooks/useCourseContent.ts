import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { removeCourseMedia } from '../lib/media.js';
import { type Chapter, type Page, type Block, type BlockType } from '../lib/courseTypes.js';

// Lazy, per-course content loader for the Course Builder. Unlike the top-level
// course list, this deliberately does NOT use the shared collection (which loads
// every row for a workspace) — it loads ONE course's chapters/pages/blocks via
// indexed `course_id` queries and holds only that tree in memory. That's the key
// scalability decision: opening a course never pulls a creator's whole corpus.
//
// Offline-first: a localStorage mirror (keyed per course) hydrates instantly and
// keeps editing working without a connection. Media is NOT here — blocks only
// carry a Storage path (see media.ts), so this stays lightweight at any scale.

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const nextPos = (items: { position: number }[]) => items.reduce((m, i) => Math.max(m, i.position), -1) + 1;

// ─── row ⇄ domain mappers ─────────────────────────────────────────────────────
const rowToChapter = (r: any): Chapter => ({
  id: r.id, courseId: r.course_id ?? r.courseId, title: r.title ?? 'Untitled chapter',
  position: r.position ?? 0,
  createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
  updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
});
const chapterToRow = (c: Chapter) => ({
  id: c.id, course_id: c.courseId, title: c.title, position: c.position,
  created_at: c.createdAt.toISOString(), updated_at: c.updatedAt.toISOString(),
});
const rowToPage = (r: any): Page => ({
  id: r.id, chapterId: r.chapter_id ?? r.chapterId, courseId: r.course_id ?? r.courseId,
  title: r.title ?? 'Untitled page', position: r.position ?? 0, isPreview: !!(r.is_preview ?? r.isPreview),
  createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
  updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
});
const pageToRow = (p: Page) => ({
  id: p.id, chapter_id: p.chapterId, course_id: p.courseId, title: p.title,
  position: p.position, is_preview: p.isPreview,
  created_at: p.createdAt.toISOString(), updated_at: p.updatedAt.toISOString(),
});
const rowToBlock = (r: any): Block => ({
  id: r.id, pageId: r.page_id ?? r.pageId, courseId: r.course_id ?? r.courseId,
  type: (r.type ?? 'text') as BlockType, content: r.content ?? {}, position: r.position ?? 0,
  createdAt: new Date(r.created_at ?? r.createdAt ?? Date.now()),
  updatedAt: new Date(r.updated_at ?? r.updatedAt ?? Date.now()),
});
const blockToRow = (b: Block) => ({
  id: b.id, page_id: b.pageId, course_id: b.courseId, type: b.type, content: b.content,
  position: b.position, created_at: b.createdAt.toISOString(), updated_at: b.updatedAt.toISOString(),
});

// fire-and-forget writes (offline-first — mirror already holds the truth locally)
const upsert = (table: string, row: any) => { supabase.from(table).upsert(row, { onConflict: 'id' }).then(() => {}, () => {}); };
const del = (table: string, id: string) => { supabase.from(table).delete().eq('id', id).then(() => {}, () => {}); };

export function useCourseContent(courseId: string | null) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);

  const lsKey = (kind: string) => `pronoia_course_${kind}:${courseId}`;

  // Load: localStorage mirror first (instant), then reconcile with Supabase.
  useEffect(() => {
    if (!courseId) { setChapters([]); setPages([]); setBlocks([]); return; }

    try {
      const ch = localStorage.getItem(lsKey('chapters'));
      const pg = localStorage.getItem(lsKey('pages'));
      const bl = localStorage.getItem(lsKey('blocks'));
      setChapters(ch ? (JSON.parse(ch) as any[]).map(rowToChapter) : []);
      setPages(pg ? (JSON.parse(pg) as any[]).map(rowToPage) : []);
      setBlocks(bl ? (JSON.parse(bl) as any[]).map(rowToBlock) : []);
    } catch { /* ignore corrupt mirror */ }

    let cancelled = false;
    (async () => {
      try {
        const [c, p, b] = await Promise.all([
          supabase.from('course_chapters').select('*').eq('course_id', courseId),
          supabase.from('course_pages').select('*').eq('course_id', courseId),
          supabase.from('course_blocks').select('*').eq('course_id', courseId),
        ]);
        if (cancelled) return;
        if (!c.error && c.data) setChapters(c.data.map(rowToChapter));
        if (!p.error && p.data) setPages(p.data.map(rowToPage));
        if (!b.error && b.data) setBlocks(b.data.map(rowToBlock));
      } catch { /* offline → keep mirror */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Mirror helpers — persist a fresh list to localStorage under the course key.
  const mirrorChapters = (list: Chapter[]) => { try { localStorage.setItem(lsKey('chapters'), JSON.stringify(list.map(chapterToRow))); } catch { /* ignore */ } };
  const mirrorPages = (list: Page[]) => { try { localStorage.setItem(lsKey('pages'), JSON.stringify(list.map(pageToRow))); } catch { /* ignore */ } };
  const mirrorBlocks = (list: Block[]) => { try { localStorage.setItem(lsKey('blocks'), JSON.stringify(list.map(blockToRow))); } catch { /* ignore */ } };

  // ─── Chapters ───────────────────────────────────────────────────────────────
  const addChapter = useCallback((title = 'New chapter'): Chapter | null => {
    if (!courseId) return null;
    const now = new Date();
    const chapter: Chapter = { id: uid('ch'), courseId, title, position: nextPos(chapters), createdAt: now, updatedAt: now };
    setChapters(prev => { const next = [...prev, chapter]; mirrorChapters(next); return next; });
    upsert('course_chapters', chapterToRow(chapter));
    return chapter;
  }, [courseId, chapters]);

  const updateChapter = useCallback((id: string, patch: Partial<Chapter>) => {
    setChapters(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...patch, updatedAt: new Date() } : c);
      mirrorChapters(next);
      const changed = next.find(c => c.id === id);
      if (changed) upsert('course_chapters', chapterToRow(changed));
      return next;
    });
  }, []);

  const deleteChapter = useCallback((id: string) => {
    // Clean up media for every block under this chapter before the DB cascade.
    const pageIds = pages.filter(p => p.chapterId === id).map(p => p.id);
    blocks.filter(b => pageIds.includes(b.pageId) && b.content.path).forEach(b => removeCourseMedia(b.content.path!));
    setBlocks(prev => { const next = prev.filter(b => !pageIds.includes(b.pageId)); mirrorBlocks(next); return next; });
    setPages(prev => { const next = prev.filter(p => p.chapterId !== id); mirrorPages(next); return next; });
    setChapters(prev => { const next = prev.filter(c => c.id !== id); mirrorChapters(next); return next; });
    del('course_chapters', id); // DB cascade removes pages + blocks
  }, [pages, blocks]);

  // ─── Pages ────────────────────────────────────────────────────────────────────
  const addPage = useCallback((chapterId: string, title = 'New page'): Page | null => {
    if (!courseId) return null;
    const now = new Date();
    const siblings = pages.filter(p => p.chapterId === chapterId);
    const page: Page = { id: uid('pg'), chapterId, courseId, title, position: nextPos(siblings), isPreview: false, createdAt: now, updatedAt: now };
    setPages(prev => { const next = [...prev, page]; mirrorPages(next); return next; });
    upsert('course_pages', pageToRow(page));
    return page;
  }, [courseId, pages]);

  const updatePage = useCallback((id: string, patch: Partial<Page>) => {
    setPages(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date() } : p);
      mirrorPages(next);
      const changed = next.find(p => p.id === id);
      if (changed) upsert('course_pages', pageToRow(changed));
      return next;
    });
  }, []);

  const deletePage = useCallback((id: string) => {
    blocks.filter(b => b.pageId === id && b.content.path).forEach(b => removeCourseMedia(b.content.path!));
    setBlocks(prev => { const next = prev.filter(b => b.pageId !== id); mirrorBlocks(next); return next; });
    setPages(prev => { const next = prev.filter(p => p.id !== id); mirrorPages(next); return next; });
    del('course_pages', id); // DB cascade removes blocks
  }, [blocks]);

  // ─── Blocks ─────────────────────────────────────────────────────────────────
  const addBlock = useCallback((pageId: string, type: BlockType): Block | null => {
    if (!courseId) return null;
    const now = new Date();
    const siblings = blocks.filter(b => b.pageId === pageId);
    const block: Block = { id: uid('bl'), pageId, courseId, type, content: {}, position: nextPos(siblings), createdAt: now, updatedAt: now };
    setBlocks(prev => { const next = [...prev, block]; mirrorBlocks(next); return next; });
    upsert('course_blocks', blockToRow(block));
    return block;
  }, [courseId, blocks]);

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...patch, updatedAt: new Date() } : b);
      mirrorBlocks(next);
      const changed = next.find(b => b.id === id);
      if (changed) upsert('course_blocks', blockToRow(changed));
      return next;
    });
  }, []);

  const deleteBlock = useCallback((id: string) => {
    const target = blocks.find(b => b.id === id);
    if (target?.content.path) removeCourseMedia(target.content.path);
    setBlocks(prev => { const next = prev.filter(b => b.id !== id); mirrorBlocks(next); return next; });
    del('course_blocks', id);
  }, [blocks]);

  // Reorder a block within its page (swap positions with the neighbour).
  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const target = prev.find(b => b.id === id);
      if (!target) return prev;
      const siblings = prev.filter(b => b.pageId === target.pageId).sort((a, b) => a.position - b.position);
      const idx = siblings.findIndex(b => b.id === id);
      const swapWith = siblings[idx + dir];
      if (!swapWith) return prev;
      const next = prev.map(b => {
        if (b.id === target.id) return { ...b, position: swapWith.position };
        if (b.id === swapWith.id) return { ...b, position: target.position };
        return b;
      });
      mirrorBlocks(next);
      upsert('course_blocks', blockToRow(next.find(b => b.id === target.id)!));
      upsert('course_blocks', blockToRow(next.find(b => b.id === swapWith.id)!));
      return next;
    });
  }, []);

  return {
    chapters, pages, blocks,
    addChapter, updateChapter, deleteChapter,
    addPage, updatePage, deletePage,
    addBlock, updateBlock, deleteBlock, moveBlock,
  };
}

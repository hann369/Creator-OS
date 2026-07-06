import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { type Course, type Chapter, type Page, type Block, type BlockType, type CourseStatus, type CourseTheme } from '../lib/courseTypes.js';

// Read-only loader for the PUBLIC course viewer (`/c/:slug`). Runs with whatever
// session the visitor has — anon or logged-in — and relies on the Phase-2
// public-read RLS (published courses only). No localStorage, no writes: a viewer
// just fetches the one course by slug and renders it.

const rowToCourse = (r: any): Course => ({
  id: r.id, workspaceId: r.workspace_id ?? 'main-space', slug: r.slug ?? null,
  title: r.title ?? 'Untitled course', subtitle: r.subtitle ?? '', coverUrl: r.cover_url ?? null,
  priceCents: r.price_cents ?? 0, currency: r.currency ?? 'eur',
  status: (r.status ?? 'draft') as CourseStatus, theme: (r.theme ?? {}) as CourseTheme,
  createdAt: new Date(r.created_at ?? Date.now()), updatedAt: new Date(r.updated_at ?? Date.now()),
});
const rowToChapter = (r: any): Chapter => ({
  id: r.id, courseId: r.course_id, title: r.title ?? '', position: r.position ?? 0,
  createdAt: new Date(r.created_at ?? Date.now()), updatedAt: new Date(r.updated_at ?? Date.now()),
});
const rowToPage = (r: any): Page => ({
  id: r.id, chapterId: r.chapter_id, courseId: r.course_id, title: r.title ?? '',
  position: r.position ?? 0, isPreview: !!r.is_preview,
  createdAt: new Date(r.created_at ?? Date.now()), updatedAt: new Date(r.updated_at ?? Date.now()),
});
const rowToBlock = (r: any): Block => ({
  id: r.id, pageId: r.page_id, courseId: r.course_id, type: (r.type ?? 'text') as BlockType,
  content: r.content ?? {}, position: r.position ?? 0,
  createdAt: new Date(r.created_at ?? Date.now()), updatedAt: new Date(r.updated_at ?? Date.now()),
});

export interface PublicCourse {
  course: Course | null;
  chapters: Chapter[];
  pages: Page[];
  blocks: Block[];
  loading: boolean;
  notFound: boolean;
}

export function usePublicCourse(slug: string): PublicCourse {
  const [state, setState] = useState<PublicCourse>({ course: null, chapters: [], pages: [], blocks: [], loading: true, notFound: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState(s => ({ ...s, loading: true, notFound: false }));
      // 1. The course itself (RLS returns it only if published).
      const cr = await supabase.from('courses').select('*').eq('slug', slug).maybeSingle();
      if (cancelled) return;
      if (cr.error || !cr.data) { setState({ course: null, chapters: [], pages: [], blocks: [], loading: false, notFound: true }); return; }

      const course = rowToCourse(cr.data);
      // 2. Its content — one indexed query per level, by course_id.
      const [ch, pg, bl] = await Promise.all([
        supabase.from('course_chapters').select('*').eq('course_id', course.id),
        supabase.from('course_pages').select('*').eq('course_id', course.id),
        supabase.from('course_blocks').select('*').eq('course_id', course.id),
      ]);
      if (cancelled) return;
      setState({
        course,
        chapters: (ch.data ?? []).map(rowToChapter),
        pages: (pg.data ?? []).map(rowToPage),
        blocks: (bl.data ?? []).map(rowToBlock),
        loading: false, notFound: false,
      });
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return state;
}

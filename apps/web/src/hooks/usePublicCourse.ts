import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { type Course, type Chapter, type Page, type Block, type BlockType, type CourseStatus, type CourseTheme } from '../lib/courseTypes.js';

// Read-only loader for the PUBLIC course viewer (`/c/:slug`). Runs with whatever
// session the visitor has — anon, a signed-in buyer, or the creator. Relies on
// the Phase-2 public-read RLS (published course meta/curriculum) + the Phase-3
// paywall RLS (non-preview block content requires an entitlement).

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
  /** Signed-in visitor's email (buyer identity), if any. */
  userEmail: string | null;
  /** True once the visitor owns the course or holds an entitlement (⇒ full access). */
  entitled: boolean;
  refetch: () => void;
}

export function usePublicCourse(slug: string): PublicCourse {
  const [state, setState] = useState<Omit<PublicCourse, 'refetch'>>({
    course: null, chapters: [], pages: [], blocks: [], loading: true, notFound: false, userEmail: null, entitled: false,
  });
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce(n => n + 1), []);

  // Re-run whenever the auth state changes (e.g. a magic-link sign-in completes),
  // so a returning buyer's newly-visible content appears without a manual reload.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => refetch());
    return () => sub.subscription.unsubscribe();
  }, [refetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState(s => ({ ...s, loading: true, notFound: false }));
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      const cr = await supabase.from('courses').select('*').eq('slug', slug).maybeSingle();
      if (cancelled) return;
      if (cr.error || !cr.data) {
        setState({ course: null, chapters: [], pages: [], blocks: [], loading: false, notFound: true, userEmail: user?.email ?? null, entitled: false });
        return;
      }
      const course = rowToCourse(cr.data);

      const [ch, pg, bl, ent] = await Promise.all([
        supabase.from('course_chapters').select('*').eq('course_id', course.id),
        supabase.from('course_pages').select('*').eq('course_id', course.id),
        supabase.from('course_blocks').select('*').eq('course_id', course.id),
        user ? supabase.from('course_entitlements').select('id').eq('course_id', course.id).limit(1) : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;

      // The creator viewing their own course is implicitly entitled.
      const isOwner = !!user && (cr.data.owner_id === user.id);
      const entitled = isOwner || ((ent as any).data?.length ?? 0) > 0;

      setState({
        course,
        chapters: (ch.data ?? []).map(rowToChapter),
        pages: (pg.data ?? []).map(rowToPage),
        blocks: (bl.data ?? []).map(rowToBlock),
        loading: false, notFound: false,
        userEmail: user?.email ?? null, entitled,
      });
    })();
    return () => { cancelled = true; };
  }, [slug, nonce]);

  return { ...state, refetch };
}

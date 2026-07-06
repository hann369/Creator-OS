-- Course Maker (Phase 2 — public viewer). Makes a PUBLISHED course readable by
-- anyone (anon or logged-in), so a buyer can open `/c/:slug` outside the app's
-- auth gate and see just the course the creator built — nothing else.
--
-- These are ADDITIVE select policies. RLS combines policies with OR, so the
-- existing owner policies still apply (owners keep full access to their drafts);
-- everyone additionally gets read access once status = 'published'.
--
-- NOTE (Phase 3): this Phase-2 step exposes the WHOLE published course publicly.
-- The per-page paywall (is_preview vs. buyer entitlement) is enforced in Phase 3
-- together with payment — until then, don't put real paid secrets behind it.

-- ─── Courses: published rows are world-readable ───────────────────────────────
do $$ begin
  create policy "courses_public_read" on public.courses
    for select to anon, authenticated
    using (status = 'published');
exception when duplicate_object then null; end $$;

-- ─── Chapters / Pages / Blocks: readable when their course is published ────────
do $$ begin
  create policy "course_chapters_public_read" on public.course_chapters
    for select to anon, authenticated
    using (exists (select 1 from public.courses c where c.id = course_chapters.course_id and c.status = 'published'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "course_pages_public_read" on public.course_pages
    for select to anon, authenticated
    using (exists (select 1 from public.courses c where c.id = course_pages.course_id and c.status = 'published'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "course_blocks_public_read" on public.course_blocks
    for select to anon, authenticated
    using (exists (select 1 from public.courses c where c.id = course_blocks.course_id and c.status = 'published'));
exception when duplicate_object then null; end $$;

-- ─── Storage: media of a published course is readable (bucket stays private) ───
-- Path convention is `{owner_uid}/{course_id}/{file}`, so the 2nd folder segment
-- is the course id. Anon can mint a signed URL only when that course is published.
do $$ begin
  create policy "course_media_public_read" on storage.objects
    for select to anon, authenticated
    using (
      bucket_id = 'course-media'
      and exists (
        select 1 from public.courses c
        where c.id = (storage.foldername(name))[2]
          and c.status = 'published'
      )
    );
exception when duplicate_object then null; end $$;

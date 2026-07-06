-- Course Maker (Phase 1 — creator side). A course is a shareable, monetizable
-- unit built from Chapters → Pages → Blocks. This migration is deliberately
-- shaped for SCALE ("hundreds of GB of published courses"):
--
--   • Media (video/pdf/images) NEVER lives in Postgres. It goes to the private
--     Storage bucket `course-media`; blocks store only a storage PATH + light
--     metadata (mime, size). So the relational rows stay tiny no matter how much
--     media a creator uploads.
--   • course_id is DENORMALIZED onto pages and blocks. That lets the builder load
--     one course's entire tree in a SINGLE indexed query (where course_id = …)
--     instead of loading every course's blocks or joining through chapters.
--   • Cascade deletes keep the tree consistent when a course/chapter/page is removed.
--
-- Phase 1 is OWNER-ONLY (RLS = auth.uid() = owner_id), like every other table.
-- Public read for `status='published'` + buyer entitlements come in Phase 2/3.

-- ─── Courses (top-level, project-scoped like goals/documents) ─────────────────
create table if not exists public.courses (
  id           text primary key,
  workspace_id text not null default 'main-space',
  owner_id     uuid default auth.uid() references auth.users(id),
  slug         text,                          -- public URL segment (set on publish)
  title        text default 'Untitled course',
  subtitle     text default '',
  cover_url    text,                          -- cover image (storage path or URL)
  price_cents  integer default 0,             -- 0 = free
  currency     text default 'eur',
  status       text default 'draft',          -- draft | published | archived
  theme        jsonb default '{}'::jsonb,     -- freely designable layout (accent, font, …)
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists courses_workspace_idx on public.courses (workspace_id);
-- slug is unique only when set (drafts have none)
create unique index if not exists courses_slug_key on public.courses (slug) where slug is not null;
alter table public.courses enable row level security;
do $$ begin
  create policy "courses_owner_select" on public.courses for select using (auth.uid() = owner_id);
  create policy "courses_owner_write"  on public.courses for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── Chapters ─────────────────────────────────────────────────────────────────
create table if not exists public.course_chapters (
  id         text primary key,
  course_id  text not null references public.courses(id) on delete cascade,
  owner_id   uuid default auth.uid() references auth.users(id),
  title      text default 'Untitled chapter',
  position   integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists course_chapters_course_idx on public.course_chapters (course_id);
alter table public.course_chapters enable row level security;
do $$ begin
  create policy "course_chapters_owner_select" on public.course_chapters for select using (auth.uid() = owner_id);
  create policy "course_chapters_owner_write"  on public.course_chapters for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── Pages (course_id denormalized for single-query load + simple RLS) ─────────
create table if not exists public.course_pages (
  id         text primary key,
  chapter_id text not null references public.course_chapters(id) on delete cascade,
  course_id  text not null references public.courses(id) on delete cascade,
  owner_id   uuid default auth.uid() references auth.users(id),
  title      text default 'Untitled page',
  position   integer default 0,
  is_preview boolean default false,           -- visible publicly without purchase (Phase 2)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists course_pages_chapter_idx on public.course_pages (chapter_id);
create index if not exists course_pages_course_idx  on public.course_pages (course_id);
alter table public.course_pages enable row level security;
do $$ begin
  create policy "course_pages_owner_select" on public.course_pages for select using (auth.uid() = owner_id);
  create policy "course_pages_owner_write"  on public.course_pages for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── Blocks (the actual content; media referenced by storage path in `content`) ─
create table if not exists public.course_blocks (
  id         text primary key,
  page_id    text not null references public.course_pages(id) on delete cascade,
  course_id  text not null references public.courses(id) on delete cascade,
  owner_id   uuid default auth.uid() references auth.users(id),
  type       text default 'text',             -- heading|text|callout|divider|image|video|pdf|embed
  content    jsonb default '{}'::jsonb,        -- { text } | { path, mime, sizeBytes, caption } | { url } …
  position   integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists course_blocks_page_idx   on public.course_blocks (page_id);
create index if not exists course_blocks_course_idx on public.course_blocks (course_id);
alter table public.course_blocks enable row level security;
do $$ begin
  create policy "course_blocks_owner_select" on public.course_blocks for select using (auth.uid() = owner_id);
  create policy "course_blocks_owner_write"  on public.course_blocks for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── Storage: private bucket for course media (uploaded DIRECT from the client) ─
-- Private in Phase 1: the builder reads via short-lived signed URLs. Public read
-- for published courses is added in Phase 2 alongside the public viewer routes.
insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', false)
on conflict (id) do nothing;

-- Owner-scoped object access. Uploads land under `{auth.uid()}/{course_id}/…`,
-- and `owner` is stamped to auth.uid() by Storage on upload.
do $$ begin
  create policy "course_media_owner_read"   on storage.objects for select to authenticated
    using (bucket_id = 'course-media' and owner = auth.uid());
  create policy "course_media_owner_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'course-media' and owner = auth.uid());
  create policy "course_media_owner_update" on storage.objects for update to authenticated
    using (bucket_id = 'course-media' and owner = auth.uid());
  create policy "course_media_owner_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'course-media' and owner = auth.uid());
exception when duplicate_object then null; end $$;

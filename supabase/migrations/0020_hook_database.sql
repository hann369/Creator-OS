-- Hook Database — a GLOBAL, shared reference library of proven short-form hooks,
-- each decomposed into the 4 hook components (Spoken / Visual / Text / Audio).
--
-- The table was originally created ad-hoc (via the Supabase MCP) and populated
-- with 406 example rows imported from the source hook database. This migration
-- makes it reproducible; it does NOT re-seed (idempotent create + policies).
--
-- Unlike the per-user tables, this is REFERENCE data: the select policy is `true`
-- so every signed-in user reads the same library. Rows are seeded with a NULL
-- owner_id (server-side); the owner-scoped write policy simply means the browser
-- anon client cannot mutate the shared library.

create table if not exists public.hook_database (
  id                            text primary key,
  workspace_id                  text not null default 'main-space',
  owner_id                      uuid default auth.uid() references auth.users(id),
  title                         text default '',
  spoken_hook_structure         text default '',
  spoken_hook_framework         text default '',
  actual_spoken_hook            text default '',
  visual_hook_graphic_selection text default '',
  visual_hook_layout_structure  text default '',
  visual_hook_visual_movement   text default '',
  text_hook_word_structure      text default '',
  text_hook_layout              text default '',
  text_hook_motion              text default '',
  audio_hook_structure          text default '',
  audio_hook_specifics          text default '',
  video_link                    text default '',
  niche                         text default '',
  content_type                  text default '',
  performance                   text default '',
  views                         numeric default 0,
  created_at                    timestamptz default now(),
  updated_at                    timestamptz default now()
);

alter table public.hook_database enable row level security;

do $$ begin
  -- Global read: the hook library is shared reference material.
  create policy "hook_database_select" on public.hook_database for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  -- Owner-scoped writes only (server-side seeding runs as service role).
  create policy "hook_database_write" on public.hook_database for all
    using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

create index if not exists hook_database_structure_idx on public.hook_database (spoken_hook_structure);
create index if not exists hook_database_views_idx on public.hook_database (views desc);

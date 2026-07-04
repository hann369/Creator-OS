-- Documents, Assets & People: three first-class, project-scoped resource stores
-- that back the matching sidebar views (previously placeholders). Each mirrors a
-- domain face — Document/Asset entities + People as collaborators/contacts — and
-- can be linked to pipeline cards (linked_card_id) the same way moodboards are.
--
-- Created AFTER 0008, so they carry per-user RLS from the start: owner_id
-- defaults to auth.uid() (the logged-in user's JWT), and policies restrict every
-- row to its owner. No permissive `using(true)` phase to migrate away from.

-- ─── Documents ───────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id             text primary key,
  workspace_id   text not null default 'main-space',
  owner_id       uuid default auth.uid() references auth.users(id),
  title          text default '',
  body           text default '',        -- markdown
  tags           text[] default '{}',
  linked_card_id text,                    -- -> pipeline_cards.id (optional)
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists documents_workspace_idx on public.documents (workspace_id);
alter table public.documents enable row level security;
do $$ begin
  create policy "documents_owner_select" on public.documents for select using (auth.uid() = owner_id);
  create policy "documents_owner_write"  on public.documents for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── Assets ──────────────────────────────────────────────────────────────────
create table if not exists public.assets (
  id             text primary key,
  workspace_id   text not null default 'main-space',
  owner_id       uuid default auth.uid() references auth.users(id),
  title          text default '',
  url            text default '',
  asset_kind     text default 'other',    -- image | video | audio | pdf | other
  mime_type      text,
  tags           text[] default '{}',
  linked_card_id text,                     -- -> pipeline_cards.id (optional)
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists assets_workspace_idx on public.assets (workspace_id);
alter table public.assets enable row level security;
do $$ begin
  create policy "assets_owner_select" on public.assets for select using (auth.uid() = owner_id);
  create policy "assets_owner_write"  on public.assets for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── People (collaborators / contacts) ───────────────────────────────────────
create table if not exists public.people (
  id             text primary key,
  workspace_id   text not null default 'main-space',
  owner_id       uuid default auth.uid() references auth.users(id),
  name           text default '',
  role           text default '',          -- e.g. Editor, Guest, Sponsor
  email          text,
  handle         text,                      -- social handle / @
  notes          text default '',
  tags           text[] default '{}',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists people_workspace_idx on public.people (workspace_id);
alter table public.people enable row level security;
do $$ begin
  create policy "people_owner_select" on public.people for select using (auth.uid() = owner_id);
  create policy "people_owner_write"  on public.people for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

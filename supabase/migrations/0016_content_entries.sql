-- Phase F — Knowledge Ingestion. The canonical content store + per-creator
-- baselines that back the Library workspace. Kept SEPARATE from the cognitive
-- graph (world_nodes/world_edges): the full imported content lives here, while
-- only the *extracted* knowledge is projected into world_nodes (provenance via
-- world_nodes.derived_from -> content_entries.id).
--
-- Follows the 0009 pattern: text ids, workspace_id default 'main-space',
-- per-user RLS with owner_id default auth.uid().
--
-- Embedding is stored as jsonb for slice 1 (the embedder is still a mock; cosine
-- runs in the API layer). pgvector (extension "vector" 0.8.0) is available on
-- this project and can replace this column with `vector(1536)` once a real
-- embedder is wired — no other schema change needed.

-- ─── Content Entries ───────────────────────────────────────────────────────────
create table if not exists public.content_entries (
  id             text primary key,
  workspace_id   text not null default 'main-space',
  owner_id       uuid default auth.uid() references auth.users(id),

  platform       text not null,             -- youtube | instagram | ...
  creator        text default '',
  creator_id     text default '',
  url            text not null,
  canonical_url  text not null,
  media_type     text default 'short',      -- short | longform | image | ...

  published_at   timestamptz,
  duration       integer,                   -- seconds
  language       text,

  title          text default '',
  description    text default '',
  thumbnail      text,
  transcript     text default '',

  comments       jsonb default '[]'::jsonb,
  statistics     jsonb default '{}'::jsonb,  -- { views, likes, comments, shares, followersAtPublish }
  metadata       jsonb default '{}'::jsonb,  -- { hashtags, mentions, music, location }
  analysis       jsonb,                      -- VideoAnalysis (structured)
  outlier        jsonb,                      -- OutlierScore { outlierScore, engagementScore, ... , label }
  outlier_score  numeric default 1,          -- denormalized for cheap range filters
  embedding      jsonb,                      -- number[] (jsonb) — see note above

  status         text not null default 'queued', -- ingestion state machine
  error          text,

  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists content_entries_workspace_idx on public.content_entries (workspace_id);
create index if not exists content_entries_platform_idx  on public.content_entries (platform);
create index if not exists content_entries_creator_idx   on public.content_entries (creator_id);
create index if not exists content_entries_canonical_idx on public.content_entries (canonical_url);
create index if not exists content_entries_status_idx    on public.content_entries (status);
-- GIN over analysis so structured filters (topic/hook/pattern/mechanism) stay fast.
create index if not exists content_entries_analysis_gin  on public.content_entries using gin (analysis);

alter table public.content_entries enable row level security;
do $$ begin
  create policy "content_entries_owner_select" on public.content_entries for select using (auth.uid() = owner_id);
  create policy "content_entries_owner_write"  on public.content_entries for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── Creator Profiles (outlier baselines) ────────────────────────────────────────
create table if not exists public.creator_profiles (
  id                        text primary key,   -- `${platform}:${creator_id}`
  workspace_id              text not null default 'main-space',
  owner_id                  uuid default auth.uid() references auth.users(id),

  platform                  text not null,
  creator_id                text not null,
  creator                   text default '',

  average_views             numeric default 0,
  median_views              numeric default 0,
  average_likes             numeric default 0,
  posting_frequency_per_week numeric default 0,
  topic_distribution        jsonb default '{}'::jsonb,
  sample_size               integer default 0,

  updated_at                timestamptz default now()
);

create index if not exists creator_profiles_workspace_idx on public.creator_profiles (workspace_id);

alter table public.creator_profiles enable row level security;
do $$ begin
  create policy "creator_profiles_owner_select" on public.creator_profiles for select using (auth.uid() = owner_id);
  create policy "creator_profiles_owner_write"  on public.creator_profiles for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

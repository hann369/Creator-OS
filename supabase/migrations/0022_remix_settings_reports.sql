-- Weekly Remix v2 — per-user settings + weekly markdown reports.
--
-- remix_settings: which AI answers the weekly remix (gemini w/ per-user key,
-- mistral as env-key fallback) and the user's content filter (the yes/no
-- questions every idea must pass). One row per user; the web app writes it
-- directly under RLS, the cron reads it via the service role.
--
-- remix_reports: one markdown report per user per run — surfaced in the
-- Library "Output" tab and downloadable as .md.

create table if not exists public.remix_settings (
  owner_id         uuid primary key default auth.uid() references auth.users(id),
  provider         text not null default 'gemini',   -- gemini | mistral
  gemini_api_key   text,                             -- per-user key; server-side use only
  content_filter   text,                             -- null → DEFAULT_CONTENT_FILTER (@pronoia/ai)
  min_filter_score integer not null default 6,
  updated_at       timestamptz default now()
);

alter table public.remix_settings enable row level security;
do $$ begin
  create policy "remix_settings_owner_select" on public.remix_settings for select using (auth.uid() = owner_id);
  create policy "remix_settings_owner_write"  on public.remix_settings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

create table if not exists public.remix_reports (
  id           text primary key,
  workspace_id text not null default 'main-space',
  owner_id     uuid default auth.uid() references auth.users(id),

  week_start   date not null,                 -- the run date (Sunday for cron runs)
  provider     text default '',               -- which AI actually answered
  sources      jsonb default '[]'::jsonb,     -- the 8 picked videos (id, title, url, mediaType, connectivity)
  ideas        jsonb default '[]'::jsonb,     -- the surviving remix ideas incl. filter scores
  ideas_count  integer default 0,
  markdown     text not null default '',      -- the downloadable .md

  created_at   timestamptz default now(),
  unique (owner_id, week_start)
);

create index if not exists remix_reports_owner_idx on public.remix_reports (owner_id, week_start desc);

alter table public.remix_reports enable row level security;
do $$ begin
  create policy "remix_reports_owner_select" on public.remix_reports for select using (auth.uid() = owner_id);
  create policy "remix_reports_owner_write"  on public.remix_reports for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

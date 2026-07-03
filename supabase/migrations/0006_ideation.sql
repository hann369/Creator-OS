-- Ideation Portal (mirrors the Notion "Ideation Portal"): a Hitlist of
-- inspiration creators + an Idea Bank of rated, status-tracked ideas that can be
-- promoted into the content pipeline. Project-scoped by workspace_id.

create table if not exists public.ideation_creators (
  id            text primary key,
  workspace_id  text not null default 'main-space',
  name          text default '',
  instagram_url text,
  youtube_url   text,
  favorite      boolean default false,
  created_at    timestamptz default now()
);
create index if not exists ideation_creators_workspace_idx on public.ideation_creators (workspace_id);
alter table public.ideation_creators enable row level security;
do $$ begin
  create policy "ideation_creators_all" on public.ideation_creators for all using (true) with check (true);
exception when duplicate_object then null; end $$;

create table if not exists public.ideas (
  id                   text primary key,
  workspace_id         text not null default 'main-space',
  title                text default '',
  status               text default 'Idea',   -- Idea | Draft | Ready To Record | Editing | Ready To Post | Posted
  rating               integer default 0,      -- 0..5 stars
  creator_id           text,                   -- -> ideation_creators.id
  inspiration_url      text,
  pain_points          text,
  packaging_questions  text,
  archived             boolean default false,
  promoted_card_id     text,                   -- -> pipeline_cards.id once promoted
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
create index if not exists ideas_workspace_idx on public.ideas (workspace_id);
alter table public.ideas enable row level security;
do $$ begin
  create policy "ideas_all" on public.ideas for all using (true) with check (true);
exception when duplicate_object then null; end $$;

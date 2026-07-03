-- Moodboards: visual reference boards attached to pipeline cards / projects.
-- Run this in the Supabase SQL editor to enable cloud sync (the app works
-- from localStorage until this table exists).

create table if not exists public.moodboards (
  id             text primary key,
  workspace_id   text not null default 'main-space',
  board_type     text default 'custom',           -- video_brand_deck | website_branding | short_form | writing | custom
  client         text default '',                 -- big header name (project / client)
  title          text not null,
  subtitle       text default '',                 -- "what it is for" (e.g. Video Brand Deck)
  note           text default '',                 -- small mockup note
  description    text default '',
  tags           jsonb default '[]'::jsonb,
  color_palette  jsonb default '[]'::jsonb,
  fonts          jsonb default '{}'::jsonb,        -- { title, subheading, caption }
  status         text default 'draft',            -- draft | active | archived
  attached_card_id text,                           -- links to pipeline_cards.id (single source of truth)
  sections       jsonb default '[]'::jsonb,        -- [{ id, title, items: [{ id, type, ratio, label, imageUrl?, color?, caption? }] }]
  notes          text default '',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists moodboards_workspace_idx on public.moodboards (workspace_id);

-- Match the access model of the existing tables (adjust to your RLS policy).
alter table public.moodboards enable row level security;

do $$ begin
  create policy "moodboards_all" on public.moodboards for all using (true) with check (true);
exception when duplicate_object then null; end $$;

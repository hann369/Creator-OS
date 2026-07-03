-- Research entities: cloud home for imported sources (Brand-DNA provenance).
-- entityStore.upsert('research') already writes to `.from('research')`; without
-- this table the write failed silently and the `derived_from` relationship's
-- target existed only in localStorage (dangling in the cloud). Columns match the
-- fields entityStore writes.

create table if not exists public.research (
  id            text primary key,
  workspace_id  text not null default 'main-space',
  title         text,
  metadata      jsonb default '{}'::jsonb,   -- { sourceUrl }
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists research_workspace_idx on public.research (workspace_id);

alter table public.research enable row level security;

do $$ begin
  create policy "research_all" on public.research for all using (true) with check (true);
exception when duplicate_object then null; end $$;

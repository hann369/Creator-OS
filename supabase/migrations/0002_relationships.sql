-- Relationships: First-class records connecting entity spine nodes.
-- Spalten: id, workspace_id, source_id, target_id, type, weight, metadata jsonb, created_at.

create table if not exists public.relationships (
  id             text primary key,
  workspace_id   text not null default 'main-space',
  source_id      text not null,
  target_id      text not null,
  type           text not null,
  weight         numeric,
  metadata       jsonb default '{}'::jsonb,
  created_at     timestamptz default now()
);

create index if not exists relationships_workspace_idx on public.relationships (workspace_id);
create index if not exists relationships_source_idx on public.relationships (source_id);
create index if not exists relationships_target_idx on public.relationships (target_id);

alter table public.relationships enable row level security;

do $$ begin
  create policy "relationships_all" on public.relationships for all using (true) with check (true);
exception when duplicate_object then null; end $$;

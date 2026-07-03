-- Goals as a first-class entity (GoalEntity in packages/domain). Previously goals
-- only existed as a world_nodes row (type 'goal') plus a hardcoded string in the
-- app; this gives them their own project-scoped store so the executive engine can
-- reason against real, user-managed targets. Project-scoped by workspace_id.

create table if not exists public.goals (
  id            text primary key,
  workspace_id  text not null default 'main-space',
  title         text default '',
  description   text default '',
  target_date   timestamptz,
  progress      real default 0,       -- 0..1
  status        text default 'active', -- active | achieved | archived
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists goals_workspace_idx on public.goals (workspace_id);
alter table public.goals enable row level security;
do $$ begin
  create policy "goals_all" on public.goals for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Projects as shared, server-side data + idea→project routing (Telegram brain
-- interface). Until now projects lived only in the browser's localStorage, so the
-- server-side bot could not see them and ideas had no project linkage. This makes
-- projects a first-class owner-scoped store and lets the bot route a captured
-- idea into the right project.

-- ─── Projects (owner-scoped — projects ARE the workspaces, not workspace-scoped) ─
create table if not exists public.projects (
  id          text primary key,
  owner_id    uuid default auth.uid() references auth.users(id),
  name        text default 'Untitled Project',
  accent      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.projects enable row level security;
do $$ begin
  create policy "projects_owner_select" on public.projects for select using (auth.uid() = owner_id);
  create policy "projects_owner_write"  on public.projects for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;

-- ─── Ideas → project linkage ─────────────────────────────────────────────────
alter table public.ideas add column if not exists project_id text;

-- ─── Telegram: remember the active project + an idea awaiting a project choice ─
alter table public.telegram_links add column if not exists active_project_id text;
alter table public.telegram_links add column if not exists pending_idea text;

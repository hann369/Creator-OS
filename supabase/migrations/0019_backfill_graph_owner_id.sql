-- Backfill owner_id on graph rows the ingestion engine projected.
--
-- makeGraphRepository wrote world_nodes/world_edges via the service-role client
-- (which bypasses RLS) without stamping owner_id, so every projected node and
-- edge was invisible to the browser, which reads under `auth.uid() = owner_id`.
-- The code is fixed; these are the rows written before the fix.
--
-- The owner is DERIVED, not hardcoded: ingestion always writes graph rows in the
-- same workspace as the content_entries row that produced them, and each
-- affected workspace has exactly one distinct owner. Workspaces with ambiguous
-- ownership are skipped rather than guessed at.

with workspace_owner as (
  select workspace_id, (array_agg(distinct owner_id))[1] as owner_id
  from public.content_entries
  where owner_id is not null
  group by workspace_id
  having count(distinct owner_id) = 1
)
update public.world_nodes n
   set owner_id = w.owner_id
  from workspace_owner w
 where n.workspace_id = w.workspace_id
   and n.owner_id is null;

with workspace_owner as (
  select workspace_id, (array_agg(distinct owner_id))[1] as owner_id
  from public.content_entries
  where owner_id is not null
  group by workspace_id
  having count(distinct owner_id) = 1
)
update public.world_edges e
   set owner_id = w.owner_id
  from workspace_owner w
 where e.workspace_id = w.workspace_id
   and e.owner_id is null;

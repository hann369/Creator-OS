-- Migration A.3: Card Positions Migration
-- Move card coordinates from world_nodes.metadata into pipeline_cards directly

-- 1. Add position columns x and y to pipeline_cards
alter table public.pipeline_cards add column if not exists x numeric;
alter table public.pipeline_cards add column if not exists y numeric;

-- 2. Backfill existing positions from world_nodes.metadata
update public.pipeline_cards c
   set x = (n.metadata->>'x')::numeric,
       y = (n.metadata->>'y')::numeric
  from public.world_nodes n
 where n.id = 'card:' || c.id;

-- 3. Delete redundant card mirror nodes from world_nodes database table
delete from public.world_nodes where id like 'card:%';

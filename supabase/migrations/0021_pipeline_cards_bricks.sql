-- Phase 3: build pipeline cards FROM the Lego Bricks.
--
-- Each card gains a `bricks` composition — the chosen option per brick (Format,
-- Spoken/Visual/Text Hook, Story Structure, CTA, Visual Layout, Audio). The
-- existing `checklists` jsonb column carries the Master Checklist gates, so no
-- new column is needed for those.

alter table public.pipeline_cards
  add column if not exists bricks jsonb not null default '{}'::jsonb;

-- Fix: boardToRow() writes an Entity `metadata` field, but 0001_moodboards.sql
-- had no such column → every moodboard upsert failed (PGRST204) and silently fell
-- back to localStorage. Add the column so moodboards actually sync to the cloud.
-- (metadata holds e.g. { importedFrom } for Brand-DNA provenance.)

alter table public.moodboards add column if not exists metadata jsonb default '{}'::jsonb;

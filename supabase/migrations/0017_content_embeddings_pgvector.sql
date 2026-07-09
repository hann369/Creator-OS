-- Phase F de-mock: real semantic search. Embeddings are now produced by Mistral
-- (mistral-embed, 1024 dims) instead of the mock random embedder, so we store
-- them in a real pgvector column and search by cosine distance.
--
-- The jsonb `embedding` column from 0016 stays (kept in sync for any JS-side use);
-- `embedding_vec` is the queryable vector.

create extension if not exists vector;

alter table public.content_entries
  add column if not exists embedding_vec vector(1024);

-- HNSW cosine index for fast nearest-neighbour search.
create index if not exists content_entries_embedding_hnsw
  on public.content_entries using hnsw (embedding_vec vector_cosine_ops);

-- Nearest-neighbour search scoped to owner + workspace. Returns ids + cosine
-- similarity (1 - distance); the caller loads the full rows (which are already
-- RLS-guarded). SECURITY INVOKER so RLS still applies to the underlying table.
create or replace function public.match_content_entries(
  query_embedding vector(1024),
  p_workspace text,
  p_owner uuid,
  match_count int default 10,
  exclude_id text default null
)
returns table (id text, similarity float)
language sql stable
as $$
  select ce.id, 1 - (ce.embedding_vec <=> query_embedding) as similarity
  from public.content_entries ce
  where ce.workspace_id = p_workspace
    and ce.owner_id = p_owner
    and ce.embedding_vec is not null
    and (exclude_id is null or ce.id <> exclude_id)
  order by ce.embedding_vec <=> query_embedding
  limit match_count;
$$;

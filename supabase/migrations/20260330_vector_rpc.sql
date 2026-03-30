-- pgvector RPC: semantic search over document_chunks
-- Called by: generate-contract, query-law Edge Functions
-- Run as part of migration: supabase db push

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.75,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (
  id          uuid,
  content     text,
  law_article text,
  source_url  text,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    content,
    law_article,
    source_url,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.document_chunks
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

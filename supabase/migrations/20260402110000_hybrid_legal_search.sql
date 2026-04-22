-- ============================================================
-- LegalShield: Hybrid Search for Document Chunks (RAG)
-- ============================================================

-- 1. Add fts_tokens column for keyword-based search on legal content
-- We use 'simple' config for Vietnamese to avoid stemmer issues, 
-- but it still allows efficient case-insensitive prefix/keyword matching.
ALTER TABLE public.document_chunks 
  ADD COLUMN IF NOT EXISTS fts_tokens tsvector 
  GENERATED ALWAYS AS (to_tsvector('simple', content || ' ' || coalesce(law_article, ''))) STORED;

-- 2. Index for FTS
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON public.document_chunks USING GIN(fts_tokens);

-- 3. Update match_document_chunks to support Hybrid Search
-- We combine scores from Vector similarity and FTS rank.
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.5, -- Lowered because reranker will handle precision
  match_count      int   DEFAULT 20,  -- Increased to provide more candidates for reranking
  p_query_text     text  DEFAULT NULL  -- Optional: New param for keyword matching
)
RETURNS TABLE (
  id          uuid,
  content     text,
  law_article text,
  source_url  text,
  similarity  float,
  fts_rank    float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    content,
    law_article,
    source_url,
    1 - (embedding <=> query_embedding) AS similarity,
    CASE 
      WHEN p_query_text IS NOT NULL 
      THEN ts_rank(fts_tokens, plainto_tsquery('simple', p_query_text))
      ELSE 0 
    END AS fts_rank
  FROM public.document_chunks
  WHERE 
    -- Include results that match EITHER high vector similarity OR keyword relevance
    (
      (1 - (embedding <=> query_embedding) > match_threshold)
      OR 
      (p_query_text IS NOT NULL AND fts_tokens @@ plainto_tsquery('simple', p_query_text))
    )
  ORDER BY 
    -- Combined ranking: Similarity is weighted more, but FTS acts as a strong boost
    (1 - (embedding <=> query_embedding)) * 0.7 + 
    (CASE WHEN p_query_text IS NOT NULL THEN ts_rank(fts_tokens, plainto_tsquery('simple', p_query_text)) ELSE 0 END) * 0.3 DESC
  LIMIT match_count;
$$;

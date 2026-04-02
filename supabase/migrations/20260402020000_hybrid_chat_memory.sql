-- ============================================================
-- LegalShield: Hybrid Search for Chat Memory
-- ============================================================

-- 1. Add fts_tokens column for keyword-based search
-- We use 'simple' config for Vietnamese to avoid stemmer issues, 
-- but it still allows efficient case-insensitive prefix/keyword matching.
ALTER TABLE public.chat_memory 
  ADD COLUMN IF NOT EXISTS fts_tokens tsvector 
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

-- 2. Index for FTS
CREATE INDEX IF NOT EXISTS idx_chat_memory_fts ON public.chat_memory USING GIN(fts_tokens);

-- 3. Update match_chat_memory to support Hybrid Search
-- We combine scores from Vector similarity and FTS rank.
CREATE OR REPLACE FUNCTION match_chat_memory(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.3, -- Lowered because reranker will handle precision
  match_count      int   DEFAULT 20,  -- Increased to provide more candidates for reranking
  p_user_id        uuid  DEFAULT auth.uid(),
  p_session_id     text  DEFAULT NULL,
  p_query_text     text  DEFAULT NULL  -- Optional: New param for keyword matching
)
RETURNS TABLE (
  content     text,
  role        text,
  similarity  float,
  fts_rank    float
)
LANGUAGE sql STABLE AS $$
  SELECT
    content,
    role,
    1 - (embedding <=> query_embedding) AS similarity,
    CASE 
      WHEN p_query_text IS NOT NULL 
      THEN ts_rank(fts_tokens, plainto_tsquery('simple', p_query_text))
      ELSE 0 
    END AS fts_rank
  FROM public.chat_memory
  WHERE user_id = p_user_id
    AND (p_session_id IS NULL OR session_id = p_session_id)
    -- Include results that match EITHER high vector similarity OR keyword relevance
    AND (
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

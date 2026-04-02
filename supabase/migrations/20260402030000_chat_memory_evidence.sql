-- ============================================================
-- LegalShield: Chat Memory Evidence & Content Type
-- Adds content_type to support evidence entries in chat_memory.
-- ============================================================

-- 1. Add content_type column
ALTER TABLE public.chat_memory
  ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'message'
  CHECK (content_type IN ('message', 'evidence'));

-- 2. Composite index for faster filtering by user + type
CREATE INDEX IF NOT EXISTS idx_chat_memory_user_type 
  ON public.chat_memory(user_id, content_type);

-- 3. Update match_chat_memory to support content_type filtering
-- and to BOOST evidence entries when query requires citation
CREATE OR REPLACE FUNCTION match_chat_memory(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.3,
  match_count      int   DEFAULT 20,
  p_user_id        uuid  DEFAULT auth.uid(),
  p_session_id     text  DEFAULT NULL,
  p_query_text     text  DEFAULT NULL,
  p_content_types  text[] DEFAULT ARRAY['message', 'evidence']
)
RETURNS TABLE (
  content       text,
  role          text,
  similarity    float,
  fts_rank      float,
  content_type  text
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
    END AS fts_rank,
    content_type
  FROM public.chat_memory
  WHERE user_id = p_user_id
    AND (p_session_id IS NULL OR session_id = p_session_id)
    AND content_type = ANY(p_content_types)
    AND (
      (1 - (embedding <=> query_embedding) > match_threshold)
      OR 
      (p_query_text IS NOT NULL AND fts_tokens @@ plainto_tsquery('simple', p_query_text))
    )
  ORDER BY 
    -- Evidence entries get a +0.15 boost when they match strongly
    (1 - (embedding <=> query_embedding)) * 0.7 + 
    (CASE WHEN p_query_text IS NOT NULL THEN ts_rank(fts_tokens, plainto_tsquery('simple', p_query_text)) ELSE 0 END) * 0.3 +
    (CASE WHEN content_type = 'evidence' AND (1 - (embedding <=> query_embedding)) > 0.5 THEN 0.15 ELSE 0 END) DESC
  LIMIT match_count;
$$;

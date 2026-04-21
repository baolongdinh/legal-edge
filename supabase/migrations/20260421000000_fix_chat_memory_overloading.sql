-- ============================================================
-- LegalShield: Fix match_chat_memory function overloading
-- Drops old function versions and creates single version with all features
-- ============================================================

-- Drop each version explicitly with parameter types
DROP FUNCTION IF EXISTS public.match_chat_memory(vector, float, int, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.match_chat_memory(vector, float, int, uuid, text, text, text[]) CASCADE;
DROP FUNCTION IF EXISTS public.match_chat_memory(vector, float, int, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.match_chat_memory(vector, float, int) CASCADE;

-- Create single unified version with all features:
-- - Vector similarity search
-- - Full-text search (hybrid)
-- - Content type filtering
-- - Evidence boosting
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.match_chat_memory TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_chat_memory TO anon;

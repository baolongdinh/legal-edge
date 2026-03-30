-- Create contract_chunks for hybrid search (FTS + Vector)
CREATE TABLE IF NOT EXISTS public.contract_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  fts_tokens tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding vector(1536), -- For Gemini text-embedding-004
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for FTS
CREATE INDEX IF NOT EXISTS contract_chunks_fts_idx ON public.contract_chunks USING GIN(fts_tokens);

-- Index for Vector
CREATE INDEX IF NOT EXISTS contract_chunks_embedding_idx ON public.contract_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Hybrid Search Function (Simple Join)
CREATE OR REPLACE FUNCTION hybrid_search_contracts(
  p_contract_id UUID,
  p_query TEXT,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH fts_results AS (
    SELECT cc.id, cc.content, ts_rank(cc.fts_tokens, plainto_tsquery('simple', p_query)) as rank
    FROM public.contract_chunks cc
    WHERE cc.contract_id = p_contract_id
      AND cc.fts_tokens @@ plainto_tsquery('simple', p_query)
    LIMIT p_match_count
  ),
  vector_results AS (
    SELECT cc.id, cc.content, (1 - (cc.embedding <=> p_query_embedding)) as search_similarity
    FROM public.contract_chunks cc
    WHERE cc.contract_id = p_contract_id
    ORDER BY cc.embedding <=> p_query_embedding
    LIMIT p_match_count
  )
  SELECT DISTINCT ON (content) 
    vr.id, 
    vr.content, 
    vr.search_similarity as similarity
  FROM vector_results vr
  LEFT JOIN fts_results fr ON vr.id = fr.id
  ORDER BY content, similarity DESC
  LIMIT p_match_count;
END;
$$;

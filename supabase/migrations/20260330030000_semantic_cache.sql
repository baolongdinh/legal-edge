-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Semantic Cache for optimized AI results
CREATE TABLE IF NOT EXISTS semantic_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_hash TEXT UNIQUE, -- Exact match fallback
    content_text TEXT,
    embedding vector(768), -- Gemini embedding dimension (768 for models/embedding-001)
    result_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for semantic search
CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding ON semantic_cache USING ivfflat (embedding vector_cosine_ops);

-- Function to find similar analyzed clauses
CREATE OR REPLACE FUNCTION find_semantic_match(p_embedding vector(768), p_threshold FLOAT DEFAULT 0.1)
RETURNS TABLE (result_json JSONB, similarity FLOAT) AS $$
BEGIN
    RETURN QUERY
    SELECT sc.result_json, (sc.embedding <=> p_embedding) as distance
    FROM semantic_cache sc
    WHERE (sc.embedding <=> p_embedding) < p_threshold
    ORDER BY distance ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

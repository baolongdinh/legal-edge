-- Migration: Resize vector columns to 512 dims for text-embedding-004 Elastic Embedding
-- text-embedding-004 with outputDimensionality=512 reduces storage ~33% vs 768, minimal accuracy loss

-- Drop dependent functions/indexes first
DROP FUNCTION IF EXISTS hybrid_search_contracts(uuid, text, vector, int);
DROP FUNCTION IF EXISTS find_semantic_match(vector, float);

-- Alter contract_chunks embedding column
ALTER TABLE contract_chunks
    ALTER COLUMN embedding TYPE vector(512)
    USING embedding::text::vector(512);

-- Alter semantic cache embedding column  
ALTER TABLE semantic_cache
    ALTER COLUMN embedding TYPE vector(512)
    USING embedding::text::vector(512);

-- Recreate hybrid_search_contracts with 512 dims
CREATE OR REPLACE FUNCTION hybrid_search_contracts(
    p_contract_id   uuid,
    p_query         text,
    p_query_embedding vector(512),
    p_match_count   int DEFAULT 5
)
RETURNS TABLE (
    id          uuid,
    content     text,
    similarity  float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id,
        cc.content,
        1 - (cc.embedding <=> p_query_embedding) AS similarity
    FROM contract_chunks cc
    WHERE cc.contract_id = p_contract_id
    ORDER BY cc.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

-- Recreate find_semantic_match with 512 dims
CREATE OR REPLACE FUNCTION find_semantic_match(
    p_embedding vector(512),
    p_threshold FLOAT DEFAULT 0.1
)
RETURNS TABLE (cached_response TEXT, similarity FLOAT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.response,
        1 - (sc.embedding <=> p_embedding) AS similarity
    FROM semantic_cache sc
    WHERE 1 - (sc.embedding <=> p_embedding) >= p_threshold
    ORDER BY sc.embedding <=> p_embedding
    LIMIT 1;
END;
$$;

-- Recreate vector index for new dimension
DROP INDEX IF EXISTS idx_contract_chunks_embedding;
DROP INDEX IF EXISTS idx_semantic_cache_embedding;

CREATE INDEX idx_contract_chunks_embedding
    ON contract_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_semantic_cache_embedding
    ON semantic_cache USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);

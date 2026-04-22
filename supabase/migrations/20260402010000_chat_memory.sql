-- ============================================================
-- LegalShield: Long-term Chat Memory (pgvector)
-- ============================================================

-- 1. Table for storing vectorized chat history
CREATE TABLE IF NOT EXISTS public.chat_memory (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id    TEXT,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  embedding     vector(768) NOT NULL, -- Gemini text-embedding-004
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. HNSW index for ultra-fast semantic search
-- We use m=16, ef_construction=64 as standard balanced params
CREATE INDEX ON public.chat_memory USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. RPC for semantic retrieval
-- Filtered by user_id and optionally session_id
CREATE OR REPLACE FUNCTION match_chat_memory(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.75,
  match_count      int   DEFAULT 5,
  p_user_id        uuid  DEFAULT auth.uid(),
  p_session_id     text  DEFAULT NULL
)
RETURNS TABLE (
  content     text,
  role        text,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    content,
    role,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.chat_memory
  WHERE user_id = p_user_id
    AND (p_session_id IS NULL OR session_id = p_session_id)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 4. Row Level Security
ALTER TABLE public.chat_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_memory" ON public.chat_memory
  FOR ALL USING (auth.uid() = user_id);

-- Optional: Index on session_id for faster filtering
CREATE INDEX idx_chat_memory_session_id ON public.chat_memory(session_id);
CREATE INDEX idx_chat_memory_user_id ON public.chat_memory(user_id);

-- ============================================================
-- LegalShield: Supabase Initial Migration
-- Run: supabase db push
-- ============================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Users (mirrors Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Subscriptions
CREATE TYPE subscription_plan AS ENUM ('free', 'pro', 'enterprise');

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan          subscription_plan NOT NULL DEFAULT 'free',
  api_calls_used  INT NOT NULL DEFAULT 0,
  api_calls_limit INT NOT NULL DEFAULT 10,
  valid_until   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Documents (uploaded by users)
CREATE TABLE IF NOT EXISTS public.documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type   TEXT,
  text_content TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Document Chunks + Vector Embeddings
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(768),          -- Gemini text-embedding-004 dimension
  source_url  TEXT,                 -- vbpl.vn reference URL
  law_article TEXT,                 -- "Điều 15 Luật Thương mại 2005"
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for sub-millisecond ANN search
CREATE INDEX ON public.document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 6. Templates (curated library)
CREATE TABLE IF NOT EXISTS public.templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  content_md  TEXT NOT NULL,
  is_public   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Contracts (user-generated drafts)
CREATE TYPE risk_level AS ENUM ('critical', 'moderate', 'note');

CREATE TABLE IF NOT EXISTS public.contracts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id),
  title       TEXT NOT NULL,
  content_md  TEXT,
  pdf_url     TEXT,
  status      TEXT DEFAULT 'draft',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Contract Risk Analysis results
CREATE TABLE IF NOT EXISTS public.contract_risks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id  UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  clause_ref   TEXT NOT NULL,
  level        risk_level NOT NULL,
  description  TEXT NOT NULL,
  citation     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_risks  ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "users_self" ON public.users FOR ALL USING (auth.uid() = id);
CREATE POLICY "subscriptions_self" ON public.subscriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "documents_self" ON public.documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "contracts_self" ON public.contracts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "risks_self" ON public.contract_risks FOR ALL
  USING (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));

-- Templates are public-readable
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_public_read" ON public.templates FOR SELECT USING (is_public = TRUE);

-- ============================================================
-- Storage Buckets (run once via Supabase dashboard or CLI)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('contract-templates', 'contract-templates', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('user-contracts', 'user-contracts', false);

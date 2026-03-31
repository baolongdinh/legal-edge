-- ============================================================
-- LegalShield: Fix Contracts Table (Column + RLS)
-- ============================================================

-- 1. Add missing content_hash column for deduplication logic
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS content_hash TEXT,
ADD COLUMN IF NOT EXISTS analysis_summary TEXT;

-- 2. Create index on content_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_contracts_content_hash ON public.contracts(content_hash);

-- 3. Fix RLS Policies for Contracts
-- Ensure that users can INSERT their own contracts
DROP POLICY IF EXISTS "contracts_self" ON public.contracts;

CREATE POLICY "contracts_select_self" ON public.contracts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "contracts_insert_self" ON public.contracts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contracts_update_self" ON public.contracts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "contracts_delete_self" ON public.contracts FOR DELETE USING (auth.uid() = user_id);

-- 4. Audit Log table for AI Consultation (Optional but good for history)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_messages_self" ON public.chat_messages FOR ALL USING (auth.uid() = user_id);

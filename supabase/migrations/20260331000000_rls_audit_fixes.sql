-- ============================================================
-- LegalShield: RLS Audit & Explicit WITH CHECK enforcement
-- ============================================================

-- Explicitly enforce WITH CHECK for INSERT operations to prevent spoofing user_id
DROP POLICY IF EXISTS "documents_self" ON public.documents;
CREATE POLICY "documents_select_self" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "documents_insert_self" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_update_self" ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "documents_delete_self" ON public.documents FOR DELETE USING (auth.uid() = user_id);

-- Enforce explicit RLS for risks
DROP POLICY IF EXISTS "risks_self" ON public.contract_risks;
CREATE POLICY "risks_select_self" ON public.contract_risks FOR SELECT USING (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));
CREATE POLICY "risks_insert_self" ON public.contract_risks FOR INSERT WITH CHECK (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));
CREATE POLICY "risks_update_self" ON public.contract_risks FOR UPDATE USING (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));
CREATE POLICY "risks_delete_self" ON public.contract_risks FOR DELETE USING (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));

-- Enforce explicit RLS for semantic cache (Read-only for public, Service Role handles inserts)
ALTER TABLE public.semantic_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "semantic_cache_read_all" ON public.semantic_cache FOR SELECT USING (true);
-- No insert/update policy, meaning only postgres / service_role can modify.

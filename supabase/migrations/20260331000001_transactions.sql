-- ============================================================
-- LegalShield: Payments & Transactions tracking for Idempotency
-- ============================================================

CREATE TABLE IF NOT EXISTS public.transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id        TEXT NOT NULL UNIQUE,       -- The MoMo/VNPAY unique order ID
  provider        TEXT NOT NULL,              -- 'momo' | 'vnpay'
  amount          BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
  ipn_received_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_select_self" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
-- No insert/update for public schema. Controlled strictly by backend service-roles (payment webhooks and generation).

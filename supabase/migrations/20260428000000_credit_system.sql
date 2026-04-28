-- Credit System Migration
-- Phase 1: Core credit tables

-- User credits balance
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 150, -- Free tier: 150 credits
  lifetime_earned INTEGER DEFAULT 150,
  lifetime_spent INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit transactions (immutable ledger)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- negative = usage, positive = purchase
  operation_type TEXT NOT NULL, -- 'chat', 'contract_analysis', 'topup', 'bonus', 'refund'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit packages for sale
CREATE TABLE IF NOT EXISTS credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_vnd INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  bonus_credits INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit usage logs for analytics
CREATE TABLE IF NOT EXISTS credit_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  credits_charged INTEGER NOT NULL,
  estimated_credits INTEGER,
  actual_cost_usd DECIMAL(10,6),
  model_used TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own transactions"
  ON credit_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anyone can view active packages"
  ON credit_packages FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can view own usage logs"
  ON credit_usage_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_credit_usage_logs_user_id ON credit_usage_logs(user_id);
CREATE INDEX idx_credit_usage_logs_created_at ON credit_usage_logs(created_at);

-- Seed credit packages
-- Pricing: 10% lower than Vietlaw.ai
INSERT INTO credit_packages (name, price_vnd, credits, bonus_credits, display_order) VALUES
  ('Starter', 153000, 2000, 0, 1),
  ('Pro', 306000, 5000, 500, 2),
  ('Business', 765000, 15000, 2000, 3)
ON CONFLICT DO NOTHING;

-- Function to grant free credits to new users
CREATE OR REPLACE FUNCTION public.grant_free_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance, lifetime_earned)
  VALUES (NEW.id, 150, 150);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-grant credits on signup
DROP TRIGGER IF EXISTS on_auth_user_created_grant_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_free_credits();

-- Grant existing users free credits (run once)
INSERT INTO user_credits (user_id, balance, lifetime_earned)
SELECT id, 150, 150 FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_credits)
ON CONFLICT DO NOTHING;

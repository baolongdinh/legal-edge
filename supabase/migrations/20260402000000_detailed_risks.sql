-- ============================================================
-- Add detailed risk fields to contract_risks
-- ============================================================

ALTER TABLE public.contract_risks 
ADD COLUMN IF NOT EXISTS risk_quote TEXT,
ADD COLUMN IF NOT EXISTS suggested_revision TEXT;

-- Update comments
COMMENT ON COLUMN public.contract_risks.risk_quote IS 'Exact quote from the contract identifying the risk';
COMMENT ON COLUMN public.contract_risks.suggested_revision IS 'Actionable suggestion to fix the identified risk';

CREATE TABLE IF NOT EXISTS public.verified_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  query_hash text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  source_domain text NOT NULL,
  source_type text NOT NULL,
  matched_article text,
  excerpt text,
  verification_status text NOT NULL DEFAULT 'unverified',
  score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verified_evidence_query_hash
  ON public.verified_evidence (query_hash);

CREATE INDEX IF NOT EXISTS idx_verified_evidence_source_domain
  ON public.verified_evidence (source_domain);

CREATE TABLE IF NOT EXISTS public.answer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  function_name text NOT NULL,
  request_hash text NOT NULL,
  question text NOT NULL,
  answer_text text NOT NULL,
  verification_status text NOT NULL,
  abstained boolean NOT NULL DEFAULT false,
  citation_count integer NOT NULL DEFAULT 0,
  official_count integer NOT NULL DEFAULT 0,
  secondary_count integer NOT NULL DEFAULT 0,
  unsupported_claim_count integer NOT NULL DEFAULT 0,
  claim_audit jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_answer_audit_request_hash
  ON public.answer_audit (request_hash);

CREATE INDEX IF NOT EXISTS idx_answer_audit_function_name
  ON public.answer_audit (function_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.citation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_audit_id uuid REFERENCES public.answer_audit(id) ON DELETE CASCADE,
  citation_text text NOT NULL,
  citation_url text NOT NULL,
  source_domain text NOT NULL,
  source_type text NOT NULL,
  verification_status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citation_events_answer_audit_id
  ON public.citation_events (answer_audit_id);

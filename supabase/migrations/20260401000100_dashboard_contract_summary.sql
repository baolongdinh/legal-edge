DROP FUNCTION IF EXISTS public.get_my_stats();
DROP FUNCTION IF EXISTS public.refresh_contract_stats();
DROP MATERIALIZED VIEW IF EXISTS public.mv_contract_stats;

CREATE MATERIALIZED VIEW public.mv_contract_stats AS
WITH risk_totals AS (
  SELECT
    contract_id,
    COUNT(*)::bigint AS risk_count
  FROM public.contract_risks
  GROUP BY contract_id
)
SELECT
  c.user_id,
  COUNT(*)::bigint AS total_contracts,
  SUM(CASE WHEN c.status = 'completed' OR COALESCE(rt.risk_count, 0) > 0 THEN 1 ELSE 0 END)::bigint AS analyzed_count,
  SUM(CASE WHEN c.status = 'pending_audit' THEN 1 ELSE 0 END)::bigint AS pending_audit_count,
  COALESCE(SUM(rt.risk_count), 0)::bigint AS total_risks,
  MAX(c.created_at) AS last_updated
FROM public.contracts c
LEFT JOIN risk_totals rt ON rt.contract_id = c.id
GROUP BY c.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_contract_stats_user ON public.mv_contract_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_user_created_at ON public.contracts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_risks_contract_level ON public.contract_risks(contract_id, level);

CREATE OR REPLACE FUNCTION public.refresh_contract_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_contract_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_stats()
RETURNS TABLE (
  total_contracts BIGINT,
  analyzed_count BIGINT,
  pending_audit_count BIGINT,
  total_risks BIGINT,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.total_contracts,
    s.analyzed_count,
    s.pending_audit_count,
    s.total_risks,
    s.last_updated
  FROM public.mv_contract_stats s
  WHERE s.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.list_my_contract_summaries(
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  created_at TIMESTAMPTZ,
  status TEXT,
  risk_count BIGINT,
  max_risk_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH risk_rollup AS (
    SELECT
      cr.contract_id,
      COUNT(*)::bigint AS risk_count,
      CASE
        WHEN BOOL_OR(cr.level = 'critical') THEN 'critical'
        WHEN BOOL_OR(cr.level = 'moderate') THEN 'moderate'
        ELSE 'note'
      END::text AS max_risk_level
    FROM public.contract_risks cr
    GROUP BY cr.contract_id
  )
  SELECT
    c.id,
    c.title,
    c.created_at,
    c.status,
    COALESCE(rr.risk_count, 0) AS risk_count,
    COALESCE(rr.max_risk_level, 'note') AS max_risk_level
  FROM public.contracts c
  LEFT JOIN risk_rollup rr ON rr.contract_id = c.id
  WHERE c.user_id = auth.uid()
  ORDER BY c.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: SELECT cron.schedule('refresh-stats-hourly', '0 * * * *', 'SELECT public.refresh_contract_stats()');

-- Materialized View for Dashboard Stats
-- Refreshes every hour to offload heavy aggregation from real-time queries

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_contract_stats AS
SELECT 
    user_id,
    COUNT(*) as total_contracts,
    SUM(CASE WHEN status = 'analyzed' THEN 1 ELSE 0 END) as analyzed_count,
    MAX(created_at) as last_updated
FROM contracts
GROUP BY user_id;

-- Unique index for faster refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_contract_stats_user ON mv_contract_stats(user_id);

-- RPC for manual refresh (can be called via Edge Function or pg_cron)
CREATE OR REPLACE FUNCTION refresh_contract_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_contract_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Ensure pg_cron is enabled in your Supabase project settings
-- SELECT cron.schedule('refresh-stats-hourly', '0 * * * *', 'SELECT refresh_contract_stats()');

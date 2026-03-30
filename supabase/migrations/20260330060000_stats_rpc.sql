-- RPC to fetch stats for the current user from the materialized view
CREATE OR REPLACE FUNCTION get_my_stats()
RETURNS TABLE (
    total_contracts BIGINT,
    analyzed_count BIGINT,
    last_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.total_contracts, s.analyzed_count, s.last_updated
    FROM mv_contract_stats s
    WHERE s.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

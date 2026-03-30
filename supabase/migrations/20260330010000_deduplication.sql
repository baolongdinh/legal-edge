-- Add content_hash for deduplication
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_contracts_hash ON contracts(content_hash);

-- Function to check if hash exists and belongs to user
CREATE OR REPLACE FUNCTION check_contract_hash(p_hash TEXT, p_user_id UUID)
RETURNS TABLE (id UUID, status TEXT) AS $$
BEGIN
    RETURN QUERY 
    SELECT c.id, c.status 
    FROM contracts c 
    WHERE c.content_hash = p_hash 
    AND c.user_id = p_user_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cleanup_ai_audit_data(
  p_semantic_cache_older_than INTERVAL DEFAULT INTERVAL '14 days',
  p_audit_older_than INTERVAL DEFAULT INTERVAL '30 days',
  p_evidence_older_than INTERVAL DEFAULT INTERVAL '30 days'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_semantic_cache INTEGER := 0;
  deleted_answer_audit INTEGER := 0;
  deleted_verified_evidence INTEGER := 0;
BEGIN
  DELETE FROM public.semantic_cache
  WHERE created_at < NOW() - p_semantic_cache_older_than;
  GET DIAGNOSTICS deleted_semantic_cache = ROW_COUNT;

  DELETE FROM public.answer_audit
  WHERE created_at < NOW() - p_audit_older_than;
  GET DIAGNOSTICS deleted_answer_audit = ROW_COUNT;

  DELETE FROM public.verified_evidence
  WHERE created_at < NOW() - p_evidence_older_than;
  GET DIAGNOSTICS deleted_verified_evidence = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_semantic_cache', deleted_semantic_cache,
    'deleted_answer_audit', deleted_answer_audit,
    'deleted_verified_evidence', deleted_verified_evidence
  );
END;
$$;

-- Optional: SELECT cron.schedule('cleanup-ai-audit-nightly', '15 3 * * *', $$SELECT public.cleanup_ai_audit_data()$$);

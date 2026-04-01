-- PostgREST upsert via `on_conflict=seed_key` requires a real unique/exclusion constraint.
-- A partial unique index is not sufficient.

WITH ranked AS (
  SELECT
    id,
    seed_key,
    ROW_NUMBER() OVER (
      PARTITION BY seed_key
      ORDER BY created_at DESC, id DESC
    ) AS row_num
  FROM public.templates
  WHERE seed_key IS NOT NULL
)
DELETE FROM public.templates t
USING ranked r
WHERE t.id = r.id
  AND r.row_num > 1;

DROP INDEX IF EXISTS idx_templates_seed_key;

ALTER TABLE public.templates
ADD CONSTRAINT templates_seed_key_key UNIQUE (seed_key);

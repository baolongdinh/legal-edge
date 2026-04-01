ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS seed_key TEXT,
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS source_domain TEXT,
ADD COLUMN IF NOT EXISTS source_note TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_seed_key
ON public.templates(seed_key)
WHERE seed_key IS NOT NULL;

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS source_artifact_path TEXT,
ADD COLUMN IF NOT EXISTS source_content_type TEXT,
ADD COLUMN IF NOT EXISTS source_capture_mode TEXT,
ADD COLUMN IF NOT EXISTS source_fetched_at TIMESTAMPTZ;

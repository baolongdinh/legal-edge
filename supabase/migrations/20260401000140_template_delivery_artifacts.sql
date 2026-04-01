ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS source_page_path TEXT,
ADD COLUMN IF NOT EXISTS download_artifact_path TEXT,
ADD COLUMN IF NOT EXISTS download_artifact_url TEXT,
ADD COLUMN IF NOT EXISTS download_artifact_content_type TEXT,
ADD COLUMN IF NOT EXISTS rendered_pdf_path TEXT,
ADD COLUMN IF NOT EXISTS rendered_pdf_generated_at TIMESTAMPTZ;

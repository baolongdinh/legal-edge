ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS storage_provider TEXT,
ADD COLUMN IF NOT EXISTS storage_object_key TEXT;

ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS pdf_provider TEXT,
ADD COLUMN IF NOT EXISTS pdf_public_id TEXT;

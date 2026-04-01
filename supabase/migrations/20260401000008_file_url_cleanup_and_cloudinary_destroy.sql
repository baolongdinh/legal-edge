UPDATE public.documents
SET file_url = COALESCE(file_url, storage_path)
WHERE file_url IS NULL
  AND storage_path IS NOT NULL;

ALTER TABLE public.documents
ALTER COLUMN file_url SET NOT NULL;

ALTER TABLE public.documents
ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS storage_resource_type TEXT;

ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS pdf_resource_type TEXT;

-- ============================================================
-- LegalShield: Chunk Deduplication Constraint
-- ============================================================
-- Purpose: Prevent duplicate document chunks from being stored
-- by adding content_hash column and unique constraint

-- 1. Add content_hash column for efficient deduplication
ALTER TABLE public.document_chunks 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- 2. Create index for hash lookups (speeds up dedup checks)
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_hash 
ON public.document_chunks(content_hash);

-- 3. Add unique constraint per source (prevents duplicate chunks from same URL)
-- Uses partial index (WHERE source_url IS NOT NULL) to allow NULL sources
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_unique_per_source 
ON public.document_chunks(source_url, content_hash) 
WHERE source_url IS NOT NULL;

-- 4. Backfill existing rows with MD5 hashes
-- This ensures existing chunks have hashes for the new constraint
UPDATE public.document_chunks 
SET content_hash = MD5(content) 
WHERE content_hash IS NULL;

-- 5. Add comment for documentation
COMMENT ON COLUMN public.document_chunks.content_hash IS 'MD5 hash of content for deduplication';
COMMENT ON INDEX idx_document_chunks_unique_per_source IS 'Prevents duplicate chunks from same source URL';

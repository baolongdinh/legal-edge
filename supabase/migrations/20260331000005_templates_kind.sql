-- LegalShield: distinguish full templates from clause snippets

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS template_kind TEXT;

UPDATE public.templates
SET template_kind = CASE
    WHEN content_md ILIKE '%CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM%'
        OR content_md ILIKE '%ĐIỀU 1%'
        OR length(content_md) > 1400
    THEN 'full_template'
    ELSE 'clause_snippet'
END
WHERE template_kind IS NULL;

ALTER TABLE public.templates
ALTER COLUMN template_kind SET DEFAULT 'clause_snippet';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'templates_template_kind_check'
    ) THEN
        ALTER TABLE public.templates
        ADD CONSTRAINT templates_template_kind_check
        CHECK (template_kind IN ('full_template', 'clause_snippet'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_templates_kind_category
ON public.templates(template_kind, category);

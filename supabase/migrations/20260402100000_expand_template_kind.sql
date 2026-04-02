-- Expand template_kind to support legal library ingestion
-- Allow 'legal_doc' for crawled laws and regulations

ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_template_kind_check;

ALTER TABLE public.templates
ADD CONSTRAINT templates_template_kind_check
CHECK (template_kind IN ('full_template', 'clause_snippet', 'legal_doc'));

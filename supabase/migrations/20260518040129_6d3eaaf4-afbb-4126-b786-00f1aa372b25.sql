ALTER TABLE public.external_records
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_external_records_category ON public.external_records(category);
CREATE INDEX IF NOT EXISTS idx_external_records_tags ON public.external_records USING GIN(tags);
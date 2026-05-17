ALTER TABLE public.outreach_sequences
  ADD COLUMN IF NOT EXISTS subject_override text,
  ADD COLUMN IF NOT EXISTS body_override text;
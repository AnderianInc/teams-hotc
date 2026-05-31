ALTER TABLE public.outreach_sequence_runs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
-- Idempotent: adds priority and inreach_trigger to follow_ups if they don't
-- already exist. Safe to run even if 20260428171900 was partially applied.
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS inreach_trigger text;

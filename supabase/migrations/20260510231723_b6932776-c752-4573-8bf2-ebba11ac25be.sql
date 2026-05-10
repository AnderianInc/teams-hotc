
ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_opt_in_source text,
  ADD COLUMN IF NOT EXISTS sms_opt_in_text text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_opt_in_source text,
  ADD COLUMN IF NOT EXISTS sms_opt_in_text text;

CREATE INDEX IF NOT EXISTS idx_attendees_sms_opt_in ON public.attendees(sms_opt_in) WHERE sms_opt_in = true;

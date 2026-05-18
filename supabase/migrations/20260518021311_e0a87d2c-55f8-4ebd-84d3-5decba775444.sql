
-- Phone standardization: preserve original raw phone, add per-contact suppression flag
ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS phone_raw text,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact_reason text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_raw text,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_contact_reason text;

-- Issues table for unparseable phones during normalization sweeps
CREATE TABLE IF NOT EXISTS public.phone_normalization_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  row_id uuid NOT NULL,
  original text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_normalization_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage phone issues" ON public.phone_normalization_issues;
CREATE POLICY "Admins manage phone issues"
  ON public.phone_normalization_issues
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


ALTER TABLE public.outreach_sequences
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT true;

ALTER TABLE public.outreach_sequence_runs
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE POLICY "Admins/FI can update sequence runs"
  ON public.outreach_sequence_runs
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins/FI can insert sequence runs"
  ON public.outreach_sequence_runs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

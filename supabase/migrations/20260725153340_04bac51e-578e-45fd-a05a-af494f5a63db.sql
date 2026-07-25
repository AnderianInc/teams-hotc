
CREATE TABLE public.pending_sms_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id uuid,
  template_slug text,
  to_phone text NOT NULL,
  to_name text,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  notes text,
  override_consent boolean NOT NULL DEFAULT false,
  consent_note text,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_sms_approvals TO authenticated;
GRANT ALL ON public.pending_sms_approvals TO service_role;

ALTER TABLE public.pending_sms_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and team leads can view scheduled sms"
  ON public.pending_sms_approvals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_any_team_lead(auth.uid()));

CREATE POLICY "Admins and team leads can insert scheduled sms"
  ON public.pending_sms_approvals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_any_team_lead(auth.uid()));

CREATE POLICY "Admins and team leads can update scheduled sms"
  ON public.pending_sms_approvals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_any_team_lead(auth.uid()));

CREATE POLICY "Admins and team leads can delete scheduled sms"
  ON public.pending_sms_approvals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_any_team_lead(auth.uid()));

CREATE TRIGGER pending_sms_approvals_set_updated_at
  BEFORE UPDATE ON public.pending_sms_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX pending_sms_approvals_status_scheduled_idx
  ON public.pending_sms_approvals (status, scheduled_for);

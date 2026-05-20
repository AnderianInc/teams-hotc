
-- 1. Email log: error column + admin delete
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS error TEXT;
CREATE POLICY "Admins can delete email log" ON public.email_log FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Pending email approvals
CREATE TABLE public.pending_email_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID,
  template_slug TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 day'),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | sent | cancelled | failed
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pending_email_status_sched ON public.pending_email_approvals(status, scheduled_for);
CREATE INDEX idx_pending_email_attendee ON public.pending_email_approvals(attendee_id);

ALTER TABLE public.pending_email_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and FI can read pending emails" ON public.pending_email_approvals
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));
CREATE POLICY "Admins and FI can insert pending emails" ON public.pending_email_approvals
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));
CREATE POLICY "Admins and FI can update pending emails" ON public.pending_email_approvals
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));
CREATE POLICY "Admins can delete pending emails" ON public.pending_email_approvals
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pending_email_updated_at BEFORE UPDATE ON public.pending_email_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Auto-queue Coffee with P.K on new attendee
CREATE OR REPLACE FUNCTION public.queue_coffee_with_pk_for_new_attendee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_subject TEXT;
  v_body TEXT;
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.do_not_contact, false) THEN RETURN NEW; END IF;

  SELECT subject, body_html INTO v_template FROM public.email_templates WHERE slug = 'coffee-with-pk' LIMIT 1;
  IF v_template IS NULL THEN RETURN NEW; END IF;

  v_subject := replace(v_template.subject, '{{first_name}}', COALESCE(NEW.first_name, ''));
  v_body := replace(v_template.body_html, '{{first_name}}', COALESCE(NEW.first_name, ''));

  INSERT INTO public.pending_email_approvals (
    attendee_id, template_slug, to_email, to_name, subject, body_html, scheduled_for, status, notes
  ) VALUES (
    NEW.id, 'coffee-with-pk', NEW.email,
    trim(concat(NEW.first_name, ' ', NEW.last_name)),
    v_subject, v_body,
    now() + INTERVAL '1 day',
    'pending',
    'Auto-queued on new attendee. Review and approve before scheduled send time.'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_coffee_with_pk
AFTER INSERT ON public.attendees
FOR EACH ROW EXECUTE FUNCTION public.queue_coffee_with_pk_for_new_attendee();

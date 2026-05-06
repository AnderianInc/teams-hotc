CREATE TABLE public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone text NOT NULL,
  to_name text,
  body text NOT NULL,
  related_attendee_id uuid,
  sent_by uuid,
  status text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and FI can read sms log"
  ON public.sms_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins and FI can insert sms log"
  ON public.sms_log FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

CREATE INDEX idx_sms_log_attendee ON public.sms_log(related_attendee_id);
CREATE INDEX idx_sms_log_sent_at ON public.sms_log(sent_at DESC);
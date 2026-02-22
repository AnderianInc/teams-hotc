
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_html text,
  sent_at timestamptz DEFAULT now(),
  sent_by uuid REFERENCES auth.users(id),
  related_attendee_id uuid,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and FI can read email log"
  ON public.email_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins and FI can insert email log"
  ON public.email_log FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

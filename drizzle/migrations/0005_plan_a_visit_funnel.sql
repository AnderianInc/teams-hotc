CREATE TABLE public.funnel_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  phone_last10 text GENERATED ALWAYS AS (nullif(right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10), '')) STORED,
  visit_date date NOT NULL,
  adults_count integer NOT NULL DEFAULT 1,
  kids_count integer NOT NULL DEFAULT 0,
  kids_ages text,
  message text,
  sms_opt_in boolean NOT NULL DEFAULT false,
  sms_opt_in_at timestamp with time zone,
  sms_opt_in_text text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  status text NOT NULL DEFAULT 'planned',
  attendee_id uuid REFERENCES public.attendees(id),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_leads TO authenticated;
GRANT ALL ON public.funnel_leads TO service_role;
ALTER TABLE public.funnel_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and FI manage funnel leads"
  ON public.funnel_leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_first_impressions_member(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_first_impressions_member(auth.uid()));

CREATE TABLE public.funnel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.funnel_leads(id) ON DELETE CASCADE,
  step text NOT NULL,
  channel text NOT NULL,
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX funnel_messages_due_idx ON public.funnel_messages (status, scheduled_for);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_messages TO authenticated;
GRANT ALL ON public.funnel_messages TO service_role;
ALTER TABLE public.funnel_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and FI read funnel messages"
  ON public.funnel_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_first_impressions_member(auth.uid()));

CREATE OR REPLACE FUNCTION public.promote_funnel_lead(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead public.funnel_leads;
  v_attendee_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_first_impressions_member(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_lead FROM public.funnel_leads WHERE id = _lead_id;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF v_lead.attendee_id IS NOT NULL THEN RETURN v_lead.attendee_id; END IF;

  -- Match existing attendee by email or phone to avoid duplicates
  IF v_lead.email IS NOT NULL AND v_lead.email <> '' THEN
    SELECT id INTO v_attendee_id FROM public.attendees
    WHERE lower(email) = lower(v_lead.email) LIMIT 1;
  END IF;
  IF v_attendee_id IS NULL AND v_lead.phone_last10 IS NOT NULL THEN
    SELECT id INTO v_attendee_id FROM public.attendees
    WHERE phone_last10 = v_lead.phone_last10 LIMIT 1;
  END IF;

  IF v_attendee_id IS NULL THEN
    INSERT INTO public.attendees (
      first_name, last_name, email, phone,
      first_visit_date, is_member, tags,
      sms_opt_in, sms_opt_in_at, sms_opt_in_source, sms_opt_in_text
    ) VALUES (
      v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone,
      v_lead.visit_date, false, ARRAY['first-timer','planned-visit'],
      v_lead.sms_opt_in, v_lead.sms_opt_in_at,
      CASE WHEN v_lead.sms_opt_in THEN 'plan-a-visit' ELSE NULL END,
      v_lead.sms_opt_in_text
    ) RETURNING id INTO v_attendee_id;
  ELSE
    UPDATE public.attendees SET
      first_visit_date = COALESCE(first_visit_date, v_lead.visit_date),
      tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}'::text[]) || ARRAY['first-timer','planned-visit'])))
    WHERE id = v_attendee_id;
  END IF;

  -- Record attendance
  INSERT INTO public.attendance_records (attendee_id, visit_date, notes)
  VALUES (v_attendee_id, v_lead.visit_date, 'Promoted from Plan a Visit funnel');

  UPDATE public.funnel_leads
  SET status = 'attended', attendee_id = v_attendee_id, updated_at = now()
  WHERE id = _lead_id;

  -- Cancel any unsent funnel messages
  UPDATE public.funnel_messages SET status = 'cancelled'
  WHERE lead_id = _lead_id AND status = 'pending';

  RETURN v_attendee_id;
END;
$$;
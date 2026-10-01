ALTER TABLE public.funnel_leads ADD COLUMN lead_type text NOT NULL DEFAULT 'visit';
ALTER TABLE public.funnel_leads ADD COLUMN preferred_team_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE public.interest_meeting_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL,
  start_time time without time zone,
  location text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interest_meeting_sessions TO authenticated;
GRANT ALL ON public.interest_meeting_sessions TO service_role;
GRANT SELECT ON public.interest_meeting_sessions TO anon;
ALTER TABLE public.interest_meeting_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active sessions"
  ON public.interest_meeting_sessions FOR SELECT TO anon, authenticated
  USING (is_active = true);
CREATE POLICY "Admins and FI manage sessions"
  ON public.interest_meeting_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_first_impressions_member(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_first_impressions_member(auth.uid()));

CREATE OR REPLACE FUNCTION public.promote_funnel_lead(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead public.funnel_leads;
  v_attendee_id uuid;
  v_tags text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_first_impressions_member(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_lead FROM public.funnel_leads WHERE id = _lead_id;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF v_lead.attendee_id IS NOT NULL THEN RETURN v_lead.attendee_id; END IF;

  v_tags := CASE WHEN v_lead.lead_type = 'interest'
    THEN ARRAY['interest-meeting']
    ELSE ARRAY['first-timer','planned-visit'] END;

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
      v_lead.visit_date, false, v_tags,
      v_lead.sms_opt_in, v_lead.sms_opt_in_at,
      CASE WHEN v_lead.sms_opt_in THEN 'funnel:' || v_lead.lead_type ELSE NULL END,
      v_lead.sms_opt_in_text
    ) RETURNING id INTO v_attendee_id;
  ELSE
    UPDATE public.attendees SET
      first_visit_date = COALESCE(first_visit_date, v_lead.visit_date),
      tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}'::text[]) || v_tags)))
    WHERE id = v_attendee_id;
  END IF;

  -- Record attendance
  INSERT INTO public.attendance_records (attendee_id, visit_date, notes)
  VALUES (v_attendee_id, v_lead.visit_date, 'Promoted from ' || v_lead.lead_type || ' funnel');

  -- Interest leads enter the volunteer onboarding pipeline
  IF v_lead.lead_type = 'interest' THEN
    INSERT INTO public.volunteer_onboarding (attendee_id, stage, preferred_team_ids, source)
    VALUES (v_attendee_id, 'interested', v_lead.preferred_team_ids, 'interest-meeting')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.funnel_leads
  SET status = 'attended', attendee_id = v_attendee_id, updated_at = now()
  WHERE id = _lead_id;

  -- Cancel any unsent funnel messages
  UPDATE public.funnel_messages SET status = 'cancelled'
  WHERE lead_id = _lead_id AND status = 'pending';

  RETURN v_attendee_id;
END;
$$;
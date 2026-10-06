CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  lead_type text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'draft',
  start_at timestamptz,
  location text,
  form_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_template boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published events" ON public.events FOR SELECT TO anon, authenticated
  USING (status = 'published' AND is_template = false);
CREATE POLICY "Managers manage events" ON public.events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_first_impressions_member(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_first_impressions_member(auth.uid()));
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.event_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'email',
  email_template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  sms_template_id uuid REFERENCES public.sms_templates(id) ON DELETE SET NULL,
  anchor text NOT NULL DEFAULT 'signup',
  offset_minutes integer NOT NULL DEFAULT 0,
  send_at_local_time time,
  requires_approval boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_workflow_steps TO authenticated;
GRANT ALL ON public.event_workflow_steps TO service_role;
ALTER TABLE public.event_workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage steps" ON public.event_workflow_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_first_impressions_member(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_first_impressions_member(auth.uid()));
CREATE TRIGGER trg_event_steps_updated BEFORE UPDATE ON public.event_workflow_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.external_source_mappings (
  source_key text PRIMARY KEY,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_source_mappings TO authenticated;
GRANT ALL ON public.external_source_mappings TO service_role;
ALTER TABLE public.external_source_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage mappings" ON public.external_source_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_first_impressions_member(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_first_impressions_member(auth.uid()));

ALTER TABLE public.funnel_leads ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.funnel_leads ADD COLUMN custom_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.funnel_leads ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX funnel_leads_tags_gin ON public.funnel_leads USING gin(tags);
CREATE INDEX funnel_leads_event_idx ON public.funnel_leads(event_id);

ALTER TABLE public.funnel_messages ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.funnel_messages ADD COLUMN step_id uuid REFERENCES public.event_workflow_steps(id) ON DELETE SET NULL;
ALTER TABLE public.funnel_messages ADD COLUMN template_id uuid;

ALTER TABLE public.email_templates ADD COLUMN category text NOT NULL DEFAULT 'broadcast';
ALTER TABLE public.sms_templates ADD COLUMN category text NOT NULL DEFAULT 'broadcast';

CREATE OR REPLACE FUNCTION public.promote_funnel_lead(_lead_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  v_tags := (CASE WHEN v_lead.lead_type = 'interest' THEN ARRAY['interest-meeting']
    WHEN v_lead.lead_type = 'visit' THEN ARRAY['first-timer','planned-visit']
    ELSE ARRAY[]::text[] END) || COALESCE(v_lead.tags, '{}'::text[]);

  IF v_lead.email IS NOT NULL AND v_lead.email <> '' THEN
    SELECT id INTO v_attendee_id FROM public.attendees WHERE lower(email) = lower(v_lead.email) LIMIT 1;
  END IF;
  IF v_attendee_id IS NULL AND v_lead.phone_last10 IS NOT NULL THEN
    SELECT id INTO v_attendee_id FROM public.attendees WHERE phone_last10 = v_lead.phone_last10 LIMIT 1;
  END IF;

  IF v_attendee_id IS NULL THEN
    INSERT INTO public.attendees (first_name, last_name, email, phone, first_visit_date, is_member, tags,
      sms_opt_in, sms_opt_in_at, sms_opt_in_source, sms_opt_in_text)
    VALUES (v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone, v_lead.visit_date, false, v_tags,
      v_lead.sms_opt_in, v_lead.sms_opt_in_at,
      CASE WHEN v_lead.sms_opt_in THEN 'funnel:' || v_lead.lead_type ELSE NULL END, v_lead.sms_opt_in_text)
    RETURNING id INTO v_attendee_id;
  ELSE
    UPDATE public.attendees SET
      first_visit_date = COALESCE(first_visit_date, v_lead.visit_date),
      tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}'::text[]) || v_tags)))
    WHERE id = v_attendee_id;
  END IF;

  INSERT INTO public.attendance_records (attendee_id, visit_date, notes)
  VALUES (v_attendee_id, v_lead.visit_date, 'Promoted from ' || v_lead.lead_type || ' registration');

  IF v_lead.lead_type = 'interest' THEN
    INSERT INTO public.volunteer_onboarding (attendee_id, stage, preferred_team_ids, source)
    VALUES (v_attendee_id, 'interested', v_lead.preferred_team_ids, 'interest-meeting')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.funnel_leads SET status = 'attended', attendee_id = v_attendee_id, updated_at = now() WHERE id = _lead_id;
  UPDATE public.funnel_messages SET status = 'cancelled' WHERE lead_id = _lead_id AND status = 'pending';
  RETURN v_attendee_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_lead_recipients(_tags_any text[] DEFAULT '{}', _require_sms boolean DEFAULT false)
 RETURNS TABLE(source_id uuid, first_name text, last_name text, email text, phone text, sms_opt_in boolean, tags text[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT l.id, l.first_name, l.last_name, l.email, l.phone, l.sms_opt_in, l.tags
  FROM public.funnel_leads l
  WHERE (public.has_role(auth.uid(),'admin') OR public.is_first_impressions_member(auth.uid()))
    AND l.attendee_id IS NULL
    AND (array_length(_tags_any,1) IS NULL OR l.tags && _tags_any)
    AND (NOT _require_sms OR (l.sms_opt_in AND NOT public.is_phone_opted_out(l.phone)));
$$;

COMMENT ON TABLE public.interest_meeting_sessions IS 'DEPRECATED: replaced by public.events';
COMMENT ON TABLE public.outreach_sequences IS 'DEPRECATED: replaced by public.event_workflow_steps';
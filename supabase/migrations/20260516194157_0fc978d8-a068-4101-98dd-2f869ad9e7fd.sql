
-- 1. External records (prayer/visit/interest)
CREATE TABLE public.external_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('prayer','visit','interest')),
  external_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','merged','created','ignored')),
  attendee_id UUID NULL,
  match_reason TEXT NULL,
  event_date DATE NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX idx_external_records_status ON public.external_records (status);
CREATE INDEX idx_external_records_attendee ON public.external_records (attendee_id);
CREATE INDEX idx_external_records_source_received ON public.external_records (source, received_at DESC);

ALTER TABLE public.external_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage external records"
  ON public.external_records FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "FI can read external records"
  ON public.external_records FOR SELECT TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "FI can update external records"
  ON public.external_records FOR UPDATE TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_external_records_updated_at
BEFORE UPDATE ON public.external_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. External sync state
CREATE TABLE public.external_sync_state (
  source TEXT PRIMARY KEY CHECK (source IN ('prayer','visit','interest','contacts')),
  last_synced_at TIMESTAMPTZ NULL,
  last_run_status TEXT NULL,
  last_error TEXT NULL,
  records_imported INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.external_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sync state"
  ON public.external_sync_state FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "FI can read sync state"
  ON public.external_sync_state FOR SELECT TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 3. Outreach sequences
CREATE TABLE public.outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('prayer','visit','interest')),
  step_order INTEGER NOT NULL,
  offset_days INTEGER NOT NULL DEFAULT 0,
  anchor TEXT NOT NULL DEFAULT 'received' CHECK (anchor IN ('received','event_date')),
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','task')),
  template_slug TEXT NULL,
  audience TEXT NOT NULL DEFAULT 'requester' CHECK (audience IN ('requester','fi_team')),
  description TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, step_order)
);

ALTER TABLE public.outreach_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sequences"
  ON public.outreach_sequences FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "FI can read sequences"
  ON public.outreach_sequences FOR SELECT TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_outreach_sequences_updated_at
BEFORE UPDATE ON public.outreach_sequences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default sequences
INSERT INTO public.outreach_sequences (source, step_order, offset_days, anchor, channel, template_slug, audience, description) VALUES
  ('prayer', 1, 0, 'received', 'email', 'prayer-alert-fi', 'fi_team', 'Alert FI/pastoral team of new prayer request'),
  ('prayer', 2, 0, 'received', 'sms', 'prayer-ack-requester', 'requester', 'Acknowledge prayer request to requester'),
  ('prayer', 3, 3, 'received', 'sms', 'prayer-checkin-d3', 'requester', 'Day 3 check-in'),
  ('prayer', 4, 7, 'received', 'email', 'prayer-invite-meeting', 'requester', 'Invite to next prayer meeting'),
  ('visit', 1, 0, 'received', 'email', 'visit-ack-requester', 'requester', 'Acknowledge visit request'),
  ('visit', 2, 0, 'received', 'email', 'visit-alert-fi', 'fi_team', 'Alert FI team of new visit request'),
  ('visit', 3, 0, 'received', 'sms', 'visit-pickup-confirm', 'requester', 'Confirm pickup details'),
  ('interest', 1, 0, 'received', 'sms', 'interest-ack-sms', 'requester', 'SMS acknowledgement'),
  ('interest', 2, 0, 'received', 'email', 'interest-ack-email', 'requester', 'Email acknowledgement'),
  ('interest', 3, -7, 'event_date', 'email', 'interest-reminder-7d', 'requester', 'One week before reminder'),
  ('interest', 4, -2, 'event_date', 'email', 'interest-reminder-2d', 'requester', 'Two days before reminder'),
  ('interest', 5, -1, 'event_date', 'email', 'interest-reminder-1d-email', 'requester', 'Day-before email'),
  ('interest', 6, -1, 'event_date', 'sms', 'interest-reminder-1d-sms', 'requester', 'Day-before SMS'),
  ('interest', 7, 0, 'event_date', 'email', 'interest-day-of-email', 'requester', 'Day-of email'),
  ('interest', 8, 0, 'event_date', 'sms', 'interest-day-of-sms', 'requester', 'Day-of SMS');

-- 4. Outreach sequence runs (dedup)
CREATE TABLE public.outreach_sequence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_record_id UUID NOT NULL REFERENCES public.external_records(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.outreach_sequences(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','skipped','failed')),
  detail TEXT NULL,
  UNIQUE (external_record_id, sequence_id)
);
CREATE INDEX idx_seq_runs_record ON public.outreach_sequence_runs (external_record_id);

ALTER TABLE public.outreach_sequence_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sequence runs"
  ON public.outreach_sequence_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

-- 5. Help feedback
CREATE TABLE public.help_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_slug TEXT NOT NULL,
  user_id UUID NULL,
  helpful BOOLEAN NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_help_feedback_article ON public.help_feedback (article_slug);

ALTER TABLE public.help_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can submit help feedback"
  ON public.help_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins read help feedback"
  ON public.help_feedback FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Auto "contacted" tag trigger on follow_up_activities
CREATE OR REPLACE FUNCTION public.tag_attendee_contacted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attendee_id UUID;
  v_today TEXT;
  v_date_tag TEXT;
BEGIN
  -- Only react to outbound contact activities (call, sms, email, in_person) — skip pure notes
  IF NEW.activity_type IS NULL OR NEW.activity_type NOT IN ('call','sms','email','in_person','visit') THEN
    RETURN NEW;
  END IF;

  SELECT fu.attendee_id INTO v_attendee_id
  FROM public.follow_ups fu
  WHERE fu.id = NEW.follow_up_id;

  IF v_attendee_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_today := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_date_tag := 'contacted:' || v_today;

  UPDATE public.attendees
  SET tags = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(tags, '{}'::text[]) || ARRAY['contacted', v_date_tag]
      )
    )
  )
  WHERE id = v_attendee_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tag_attendee_contacted
AFTER INSERT ON public.follow_up_activities
FOR EACH ROW EXECUTE FUNCTION public.tag_attendee_contacted();

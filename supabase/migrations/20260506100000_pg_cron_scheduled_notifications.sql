-- Enable pg_cron extension (requires Supabase Pro or pg_cron enabled in dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────
-- Helper: call the `notify` Edge Function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.call_notify(
  p_recipient_id uuid,
  p_type         text,
  p_title        text,
  p_body         text DEFAULT NULL,
  p_url          text DEFAULT NULL,
  p_data         jsonb DEFAULT '{}'::jsonb,
  p_high_priority boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url     text;
  v_key     text;
  v_payload jsonb;
BEGIN
  v_url  := current_setting('app.supabase_url', true) || '/functions/v1/notify';
  v_key  := current_setting('app.service_role_key', true);

  v_payload := jsonb_build_object(
    'recipient_id',  p_recipient_id,
    'type',          p_type,
    'title',         p_title,
    'body',          p_body,
    'url',           p_url,
    'data',          p_data,
    'high_priority', p_high_priority
  );

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := v_payload::text
  );
END;
$$;


-- ─────────────────────────────────────────────
-- Job 1: roster_reminder — runs daily at 08:00 UTC
-- Notifies volunteers assigned to events starting tomorrow (within 24–48 h window)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_roster_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      re.user_id,
      ev.title AS event_title,
      ev.date  AS event_date,
      ev.id    AS event_id
    FROM public.roster_entries re
    JOIN public.roster_events  ev ON ev.id = re.event_id
    WHERE
      -- event is tomorrow (the 24-hour window)
      ev.date = (current_date + interval '1 day')::date
  LOOP
    PERFORM public.call_notify(
      p_recipient_id  := r.user_id,
      p_type          := 'roster_reminder',
      p_title         := 'Reminder: ' || r.event_title || ' is tomorrow',
      p_body          := 'You are scheduled to serve on ' || r.event_date::text || '. See you there!',
      p_url           := '/team-dashboard',
      p_data          := jsonb_build_object('event_id', r.event_id),
      p_high_priority := false
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'roster-reminder-daily',
  '0 8 * * *',           -- 08:00 UTC every day
  'SELECT public.send_roster_reminders()'
);


-- ─────────────────────────────────────────────
-- Job 2: follow_up_overdue — runs daily at 09:00 UTC
-- Notifies assignees whose follow-ups are past due_date and still open
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_followup_overdue_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      fu.id          AS follow_up_id,
      fu.assigned_to AS assignee_id,
      fu.due_date,
      fu.type        AS follow_up_type,
      at.full_name   AS contact_name
    FROM public.follow_ups fu
    JOIN public.attendees  at ON at.id = fu.attendee_id
    WHERE
      fu.assigned_to IS NOT NULL
      AND fu.status NOT IN ('closed', 'connected', 'no_response')
      AND fu.due_date < current_date
  LOOP
    PERFORM public.call_notify(
      p_recipient_id  := r.assignee_id,
      p_type          := 'follow_up_overdue',
      p_title         := 'Overdue follow-up: ' || r.contact_name,
      p_body          := 'This ' || r.follow_up_type || ' follow-up was due on '
                         || r.due_date::text || ' and is still open.',
      p_url           := '/first-impressions',
      p_data          := jsonb_build_object('follow_up_id', r.follow_up_id),
      p_high_priority := true
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'followup-overdue-daily',
  '0 9 * * *',           -- 09:00 UTC every day
  'SELECT public.send_followup_overdue_alerts()'
);

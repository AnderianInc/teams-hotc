-- Generic key-value settings store used by AutoTriggerSettings and other config panels
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upsert app settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default trigger configuration
INSERT INTO public.app_settings (key, value) VALUES (
  'inreach_trigger_config',
  '{
    "attendance_drop_enabled": true,
    "attendance_drop_weeks": 3,
    "volunteer_inactive_enabled": true,
    "volunteer_inactive_days": 30,
    "default_inreach_assignee": "",
    "outreach_followup_enabled": true,
    "outreach_followup_days": 3
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- Function: run_inreach_auto_triggers
-- Runs nightly via pg_cron.
-- Reads trigger config from app_settings and creates inreach follow-ups for:
--   1. Members whose attendance has dropped below their normal baseline
--   2. Volunteers who have had no roster assignments in N days
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_inreach_auto_triggers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg                      jsonb;
  v_drop_enabled           boolean;
  v_drop_weeks             int;
  v_inactive_enabled       boolean;
  v_inactive_days          int;
  v_default_assignee       uuid;
  r                        RECORD;
  v_cutoff_attendance      date;
  v_cutoff_assignment      date;
  v_already_open           boolean;
BEGIN
  -- Load config (fall back to defaults if missing)
  SELECT COALESCE(value, '{}'::jsonb)
    INTO cfg
    FROM public.app_settings
   WHERE key = 'inreach_trigger_config';

  v_drop_enabled     := COALESCE((cfg->>'attendance_drop_enabled')::boolean, true);
  v_drop_weeks       := COALESCE((cfg->>'attendance_drop_weeks')::int, 3);
  v_inactive_enabled := COALESCE((cfg->>'volunteer_inactive_enabled')::boolean, true);
  v_inactive_days    := COALESCE((cfg->>'volunteer_inactive_days')::int, 30);
  v_default_assignee := NULLIF(cfg->>'default_inreach_assignee', '')::uuid;

  -- ── 1. Attendance drop trigger ──────────────────────────────────────────
  IF v_drop_enabled THEN
    v_cutoff_attendance := current_date - (v_drop_weeks * 7);

    FOR r IN
      SELECT
        me.user_id,
        me.full_name,
        me.last_attendance_date,
        me.engagement_band
      FROM public.member_engagement me
      WHERE
        me.engagement_band IN ('drifting', 'at_risk', 'inactive')
        AND (me.last_attendance_date IS NULL OR me.last_attendance_date <= v_cutoff_attendance)
    LOOP
      -- Skip if an open inreach follow-up already exists for this member
      SELECT EXISTS (
        SELECT 1 FROM public.follow_ups fu
        JOIN public.attendees a ON a.id = fu.attendee_id
        JOIN public.profiles p ON p.attendee_id = a.id
        WHERE p.user_id = r.user_id
          AND fu.type = 'inreach'
          AND fu.inreach_trigger = 'attendance_drop'
          AND fu.status NOT IN ('closed', 'no_response', 'connected')
      ) INTO v_already_open;

      IF NOT v_already_open THEN
        -- Find this member's attendee record
        INSERT INTO public.follow_ups (
          attendee_id,
          type,
          status,
          priority,
          inreach_trigger,
          assigned_to,
          due_date,
          notes
        )
        SELECT
          p.attendee_id,
          'inreach',
          'pending',
          CASE r.engagement_band
            WHEN 'inactive' THEN 'high'
            WHEN 'at_risk'  THEN 'high'
            ELSE 'normal'
          END,
          'attendance_drop',
          v_default_assignee,
          current_date + 3,
          'Auto-triggered: member attendance has dropped (' || r.engagement_band || '). Last attendance: '
            || COALESCE(r.last_attendance_date::text, 'never') || '.'
        FROM public.profiles p
        WHERE p.user_id = r.user_id
          AND p.attendee_id IS NOT NULL;
      END IF;
    END LOOP;
  END IF;

  -- ── 2. Volunteer inactivity trigger ─────────────────────────────────────
  IF v_inactive_enabled THEN
    v_cutoff_assignment := current_date - v_inactive_days;

    FOR r IN
      SELECT
        tm.user_id,
        p.full_name,
        p.attendee_id,
        MAX(ev.date) AS last_assignment_date
      FROM public.team_members tm
      JOIN public.profiles p ON p.user_id = tm.user_id
      LEFT JOIN public.roster_entries re ON re.user_id = tm.user_id
      LEFT JOIN public.roster_events  ev ON ev.id = re.event_id
      GROUP BY tm.user_id, p.full_name, p.attendee_id
      HAVING MAX(ev.date) IS NULL OR MAX(ev.date) <= v_cutoff_assignment
    LOOP
      CONTINUE WHEN r.attendee_id IS NULL;

      SELECT EXISTS (
        SELECT 1 FROM public.follow_ups fu
        WHERE fu.attendee_id = r.attendee_id
          AND fu.type = 'inreach'
          AND fu.inreach_trigger = 'volunteer_inactive'
          AND fu.status NOT IN ('closed', 'no_response', 'connected')
      ) INTO v_already_open;

      IF NOT v_already_open THEN
        INSERT INTO public.follow_ups (
          attendee_id,
          type,
          status,
          priority,
          inreach_trigger,
          assigned_to,
          due_date,
          notes
        ) VALUES (
          r.attendee_id,
          'inreach',
          'pending',
          'normal',
          'volunteer_inactive',
          v_default_assignee,
          current_date + 7,
          'Auto-triggered: volunteer has had no roster assignments in ' || v_inactive_days
            || ' days. Last assignment: '
            || COALESCE(r.last_assignment_date::text, 'never') || '.'
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- Schedule nightly at 02:00 UTC
SELECT cron.schedule(
  'inreach-auto-triggers-nightly',
  '0 2 * * *',
  'SELECT public.run_inreach_auto_triggers()'
);

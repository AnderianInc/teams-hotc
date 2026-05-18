-- Recompute scheduled_for for pending/approved outreach runs using event_date anchor
-- at 9 AM in the church's local timezone. This fixes the off-by-one day bug where
-- YYYY-MM-DD event_date was parsed as UTC midnight, displaying as the prior day in PT.
DO $$
DECLARE
  v_tz text;
BEGIN
  SELECT COALESCE((value->>'tz'), 'America/Los_Angeles') INTO v_tz
  FROM public.app_settings WHERE key = 'church_timezone';
  IF v_tz IS NULL THEN v_tz := 'America/Los_Angeles'; END IF;

  UPDATE public.outreach_sequence_runs r
  SET scheduled_for = (
    ((er.event_date + s.offset_days)::text || ' 09:00:00')::timestamp AT TIME ZONE v_tz
  )
  FROM public.outreach_sequences s, public.external_records er
  WHERE r.sequence_id = s.id
    AND r.external_record_id = er.id
    AND s.anchor = 'event_date'
    AND er.event_date IS NOT NULL
    AND r.status IN ('pending_approval', 'approved');
END $$;

-- 1. Trigger: when an external_record is linked to an attendee, ensure an outreach
-- follow-up exists at the 'interested' stage (does not downgrade an existing stage).
CREATE OR REPLACE FUNCTION public.ensure_external_record_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF NEW.attendee_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('created','merged') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO existing_id
  FROM public.follow_ups
  WHERE attendee_id = NEW.attendee_id AND type = 'outreach'
  ORDER BY created_at ASC LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.follow_ups (
      attendee_id, type, priority, status, method, due_date, prospect_pipeline_stage, notes
    ) VALUES (
      NEW.attendee_id, 'outreach', 'normal', 'pending', 'email',
      CURRENT_DATE + INTERVAL '1 day', 'interested',
      'Auto-created from external source: ' || NEW.source
    );
  ELSE
    UPDATE public.follow_ups
    SET prospect_pipeline_stage = COALESCE(prospect_pipeline_stage, 'interested'),
        updated_at = now()
    WHERE id = existing_id AND prospect_pipeline_stage IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_external_records_pipeline ON public.external_records;
CREATE TRIGGER trg_external_records_pipeline
AFTER INSERT OR UPDATE OF attendee_id, status ON public.external_records
FOR EACH ROW EXECUTE FUNCTION public.ensure_external_record_pipeline();

-- 2. Helper to advance interest-meeting contacts on first outbound send
CREATE OR REPLACE FUNCTION public.advance_interest_pipeline(_attendee_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.follow_ups
  SET prospect_pipeline_stage = 'invited', updated_at = now()
  WHERE attendee_id = _attendee_id
    AND type = 'outreach'
    AND prospect_pipeline_stage = 'interested';
$$;

-- 3. Backfill existing external_records into pipeline (run trigger logic for each)
DO $$
DECLARE r record;
DECLARE existing_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (attendee_id) id, attendee_id, source, status
    FROM public.external_records
    WHERE attendee_id IS NOT NULL AND status IN ('created','merged')
    ORDER BY attendee_id, received_at ASC
  LOOP
    SELECT id INTO existing_id
    FROM public.follow_ups
    WHERE attendee_id = r.attendee_id AND type = 'outreach'
    ORDER BY created_at ASC LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO public.follow_ups (
        attendee_id, type, priority, status, method, due_date, prospect_pipeline_stage, notes
      ) VALUES (
        r.attendee_id, 'outreach', 'normal', 'pending', 'email',
        CURRENT_DATE + INTERVAL '1 day', 'interested',
        'Backfilled from external source: ' || r.source
      );
    ELSE
      UPDATE public.follow_ups
      SET prospect_pipeline_stage = COALESCE(prospect_pipeline_stage, 'interested')
      WHERE id = existing_id AND prospect_pipeline_stage IS NULL;
    END IF;
  END LOOP;
END $$;

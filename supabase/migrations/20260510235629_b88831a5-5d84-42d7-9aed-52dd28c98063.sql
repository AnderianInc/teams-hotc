CREATE OR REPLACE FUNCTION public.ensure_first_timer_outreach_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_follow_up_id uuid;
BEGIN
  IF NEW.first_visit_date IS NULL OR COALESCE(NEW.is_member, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT fu.id INTO existing_follow_up_id
  FROM public.follow_ups fu
  WHERE fu.attendee_id = NEW.id
    AND fu.type = 'outreach'
  ORDER BY
    CASE WHEN fu.prospect_pipeline_stage IS NOT NULL THEN 0 ELSE 1 END,
    fu.created_at ASC
  LIMIT 1;

  IF existing_follow_up_id IS NOT NULL THEN
    UPDATE public.follow_ups
    SET prospect_pipeline_stage = COALESCE(prospect_pipeline_stage, 'visited'),
        type = COALESCE(type, 'outreach'),
        updated_at = now()
    WHERE id = existing_follow_up_id
      AND prospect_pipeline_stage IS NULL;
  ELSE
    INSERT INTO public.follow_ups (
      attendee_id,
      type,
      priority,
      status,
      method,
      due_date,
      prospect_pipeline_stage,
      notes
    ) VALUES (
      NEW.id,
      'outreach',
      'normal',
      'pending',
      'in_person',
      CURRENT_DATE + INTERVAL '1 day',
      'visited',
      'Auto-created: first-time visitor added to outreach pipeline.'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_first_timer_outreach_pipeline_on_attendees ON public.attendees;
CREATE TRIGGER ensure_first_timer_outreach_pipeline_on_attendees
AFTER INSERT OR UPDATE OF first_visit_date, is_member ON public.attendees
FOR EACH ROW
WHEN (NEW.first_visit_date IS NOT NULL AND COALESCE(NEW.is_member, false) = false)
EXECUTE FUNCTION public.ensure_first_timer_outreach_pipeline();

WITH missing AS (
  SELECT a.id AS attendee_id
  FROM public.attendees a
  WHERE a.first_visit_date IS NOT NULL
    AND COALESCE(a.is_member, false) = false
    AND NOT EXISTS (
      SELECT 1
      FROM public.follow_ups fu
      WHERE fu.attendee_id = a.id
        AND fu.type = 'outreach'
        AND fu.prospect_pipeline_stage IS NOT NULL
    )
), updated AS (
  UPDATE public.follow_ups fu
  SET prospect_pipeline_stage = 'visited',
      type = 'outreach',
      updated_at = now()
  FROM missing m
  WHERE fu.id = (
    SELECT fu2.id
    FROM public.follow_ups fu2
    WHERE fu2.attendee_id = m.attendee_id
      AND fu2.type = 'outreach'
    ORDER BY fu2.created_at ASC
    LIMIT 1
  )
  RETURNING fu.attendee_id
)
INSERT INTO public.follow_ups (
  attendee_id,
  type,
  priority,
  status,
  method,
  due_date,
  prospect_pipeline_stage,
  notes
)
SELECT
  m.attendee_id,
  'outreach',
  'normal',
  'pending',
  'in_person',
  CURRENT_DATE + INTERVAL '1 day',
  'visited',
  'Auto-created: first-time visitor backfilled into outreach pipeline.'
FROM missing m
WHERE NOT EXISTS (
  SELECT 1 FROM updated u WHERE u.attendee_id = m.attendee_id
);
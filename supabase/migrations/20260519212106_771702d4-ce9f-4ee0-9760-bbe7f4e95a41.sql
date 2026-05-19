-- Auto-remove first-timer tag when an attendee has 2+ attendance records
CREATE OR REPLACE FUNCTION public.remove_first_timer_on_repeat_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  visit_count INT;
BEGIN
  SELECT COUNT(*) INTO visit_count
  FROM public.attendance_records
  WHERE attendee_id = NEW.attendee_id;

  IF visit_count >= 2 THEN
    UPDATE public.attendees
    SET tags = COALESCE(array_remove(tags, 'first-timer'), '{}'::text[])
    WHERE id = NEW.attendee_id
      AND 'first-timer' = ANY(COALESCE(tags, '{}'::text[]));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remove_first_timer_on_repeat_visit_trg ON public.attendance_records;
CREATE TRIGGER remove_first_timer_on_repeat_visit_trg
AFTER INSERT ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.remove_first_timer_on_repeat_visit();

-- Backfill: remove first-timer tag from anyone who already has 2+ visits
UPDATE public.attendees a
SET tags = COALESCE(array_remove(tags, 'first-timer'), '{}'::text[])
WHERE 'first-timer' = ANY(COALESCE(tags, '{}'::text[]))
  AND (SELECT COUNT(*) FROM public.attendance_records ar WHERE ar.attendee_id = a.id) >= 2;
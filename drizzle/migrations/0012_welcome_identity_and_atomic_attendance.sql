CREATE TABLE public.welcome_device_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE,
 attendee_id uuid REFERENCES public.attendees(id) ON DELETE CASCADE, user_id uuid,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 year'), created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT welcome_device_identity CHECK (attendee_id IS NOT NULL OR user_id IS NOT NULL)
);
GRANT ALL ON public.welcome_device_tokens TO service_role;
ALTER TABLE public.welcome_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_linked_weekly_attendance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE linked_user uuid; linked_attendee uuid;
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 IF NEW.user_id IS NOT NULL THEN
  SELECT attendee_id INTO linked_attendee FROM public.profiles WHERE user_id = NEW.user_id;
  IF linked_attendee IS NOT NULL AND NEW.attendee_id IS DISTINCT FROM linked_attendee THEN
   INSERT INTO public.weekly_attendance(attendee_id,service_date,status,is_self_reported,checked_in_by)
   VALUES(linked_attendee,NEW.service_date,NEW.status,NEW.is_self_reported,NEW.checked_in_by)
   ON CONFLICT (attendee_id,service_date) DO UPDATE SET status=EXCLUDED.status,is_self_reported=EXCLUDED.is_self_reported,checked_in_by=EXCLUDED.checked_in_by;
  END IF;
 ELSIF NEW.attendee_id IS NOT NULL THEN
  FOR linked_user IN SELECT user_id FROM public.profiles WHERE attendee_id=NEW.attendee_id LOOP
   INSERT INTO public.weekly_attendance(user_id,service_date,status,is_self_reported,checked_in_by)
   VALUES(linked_user,NEW.service_date,NEW.status,NEW.is_self_reported,NEW.checked_in_by)
   ON CONFLICT (user_id,service_date) DO UPDATE SET status=EXCLUDED.status,is_self_reported=EXCLUDED.is_self_reported,checked_in_by=EXCLUDED.checked_in_by;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_linked_weekly_attendance AFTER INSERT OR UPDATE OF status ON public.weekly_attendance
FOR EACH ROW EXECUTE FUNCTION public.sync_linked_weekly_attendance();

CREATE OR REPLACE FUNCTION public.record_welcome_attendance(_user_id uuid DEFAULT NULL,_attendee_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tz text; today_local date; sunday date; person_name text; already boolean; linked_attendee uuid;
BEGIN
 SELECT value->>'tz' INTO tz FROM public.app_settings WHERE key='church_timezone';
 today_local := (now() AT TIME ZONE coalesce(tz,'America/Los_Angeles'))::date;
 sunday := today_local - extract(dow FROM today_local)::integer;
 IF _user_id IS NOT NULL THEN
  SELECT full_name,attendee_id INTO person_name,linked_attendee FROM public.profiles WHERE user_id=_user_id;
  IF person_name IS NULL THEN RAISE EXCEPTION 'Registered account not found'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.weekly_attendance WHERE service_date=sunday AND status IN ('present','late') AND (user_id=_user_id OR attendee_id=linked_attendee)) INTO already;
  INSERT INTO public.weekly_attendance(user_id,service_date,status,is_self_reported) VALUES(_user_id,sunday,'present',true)
  ON CONFLICT(user_id,service_date) DO UPDATE SET status='present',is_self_reported=true;
 ELSE
  SELECT first_name || ' ' || last_name INTO person_name FROM public.attendees WHERE id=_attendee_id;
  IF person_name IS NULL THEN RAISE EXCEPTION 'Registered attendee not found'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.weekly_attendance WHERE attendee_id=_attendee_id AND service_date=sunday AND status IN ('present','late')) INTO already;
  INSERT INTO public.weekly_attendance(attendee_id,service_date,status,is_self_reported) VALUES(_attendee_id,sunday,'present',true)
  ON CONFLICT(attendee_id,service_date) DO UPDATE SET status='present',is_self_reported=true;
 END IF;
 RETURN jsonb_build_object('name',person_name,'serviceDate',sunday,'status',CASE WHEN already THEN 'already_checked_in' ELSE 'checked_in' END);
END $$;
REVOKE ALL ON FUNCTION public.record_welcome_attendance(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_welcome_attendance(uuid,uuid) TO service_role;
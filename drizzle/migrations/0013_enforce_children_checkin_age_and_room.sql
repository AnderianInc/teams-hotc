CREATE OR REPLACE FUNCTION public.children_room_for_dob(_dob date, _on date)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _age integer; _room uuid; _matches integer;
BEGIN
  IF _dob IS NULL OR _dob > _on THEN RAISE EXCEPTION 'Add a valid date of birth before checking in.'; END IF;
  _age := extract(year from age(_on, _dob))::integer;
  IF _age > 14 THEN RAISE EXCEPTION 'Children''s Ministry is for ages 0–14. Ages 15–19 belong in Young Adults.'; END IF;
  SELECT count(*) INTO _matches FROM public.rooms WHERE min_age <= _age AND max_age >= _age;
  IF _matches <> 1 THEN RAISE EXCEPTION 'Exactly one class must be configured for age %.', _age; END IF;
  SELECT id INTO _room FROM public.rooms WHERE min_age <= _age AND max_age >= _age;
  RETURN _room;
END; $$;
REVOKE ALL ON FUNCTION public.children_room_for_dob(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.children_room_for_dob(date,date) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.enforce_children_checkin_age_room()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dob date; _on date;
BEGIN
  SELECT date_of_birth INTO _dob FROM public.children WHERE id = NEW.child_id;
  _on := (COALESCE(NEW.checked_in_at, now()) AT TIME ZONE 'America/Los_Angeles')::date;
  NEW.room_id := public.children_room_for_dob(_dob, _on);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_children_checkin_age_room() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_children_checkin_age_room BEFORE INSERT OR UPDATE OF child_id, room_id ON public.check_ins FOR EACH ROW EXECUTE FUNCTION public.enforce_children_checkin_age_room();
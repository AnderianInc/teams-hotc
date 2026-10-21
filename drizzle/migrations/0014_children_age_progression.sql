CREATE OR REPLACE FUNCTION public.ministry_group_for_dob(_dob date, _on date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _dob IS NULL THEN NULL
    WHEN date_part('year', age(_on, _dob)) >= 20 THEN 'Adult'
    WHEN date_part('year', age(_on, _dob)) >= 15 THEN 'Young Adults'
    ELSE (SELECT r.name FROM public.rooms r WHERE r.id = public.children_room_for_dob(_dob, _on))
  END
$$;

CREATE OR REPLACE FUNCTION public.set_child_ministry_group()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.grade_group := COALESCE(public.ministry_group_for_dob(NEW.date_of_birth), NEW.grade_group);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_child_ministry_group ON public.children;
CREATE TRIGGER trg_set_child_ministry_group BEFORE INSERT OR UPDATE OF date_of_birth, grade_group ON public.children
FOR EACH ROW EXECUTE FUNCTION public.set_child_ministry_group();

CREATE OR REPLACE FUNCTION public.refresh_children_ministry_groups()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.children c SET grade_group = public.ministry_group_for_dob(c.date_of_birth)
  WHERE c.date_of_birth IS NOT NULL
    AND c.grade_group IS DISTINCT FROM public.ministry_group_for_dob(c.date_of_birth);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.refresh_children_ministry_groups() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_children_ministry_groups() TO authenticated, service_role;

UPDATE public.children c SET grade_group = public.ministry_group_for_dob(c.date_of_birth)
WHERE c.date_of_birth IS NOT NULL;
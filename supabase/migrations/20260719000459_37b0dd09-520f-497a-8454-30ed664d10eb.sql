
CREATE OR REPLACE FUNCTION public.ensure_todays_service()
RETURNS public.services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service public.services;
  v_name text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_kids_ministry_member(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Try today's active service
  SELECT * INTO v_service
  FROM public.services
  WHERE service_date = CURRENT_DATE AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_service.id IS NOT NULL THEN
    RETURN v_service;
  END IF;

  -- Prefer name from a scheduled roster_event today
  SELECT name INTO v_name
  FROM public.roster_events
  WHERE event_date = CURRENT_DATE
  ORDER BY created_at ASC
  LIMIT 1;

  INSERT INTO public.services (name, service_date, is_active)
  VALUES (COALESCE(v_name, to_char(CURRENT_DATE, 'FMDay, Mon FMDD')), CURRENT_DATE, true)
  RETURNING * INTO v_service;

  RETURN v_service;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_todays_service() TO authenticated;

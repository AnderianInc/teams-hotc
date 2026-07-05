CREATE OR REPLACE FUNCTION public.update_service_slot_songs(_slot_id uuid, _songs text[])
RETURNS public.service_instance_slots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot public.service_instance_slots;
BEGIN
  SELECT * INTO v_slot
  FROM public.service_instance_slots
  WHERE id = _slot_id;

  IF v_slot.id IS NULL THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR (v_slot.team_id IS NOT NULL AND public.is_team_member(auth.uid(), v_slot.team_id))
  ) THEN
    RAISE EXCEPTION 'Not allowed to update songs for this slot';
  END IF;

  UPDATE public.service_instance_slots
  SET songs = COALESCE(_songs, '{}'::text[]), updated_at = now()
  WHERE id = _slot_id
  RETURNING * INTO v_slot;

  RETURN v_slot;
END;
$$;

REVOKE ALL ON FUNCTION public.update_service_slot_songs(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_service_slot_songs(uuid, text[]) TO authenticated;
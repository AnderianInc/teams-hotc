ALTER TABLE public.service_template_slots ADD COLUMN IF NOT EXISTS song_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.service_instance_slots ADD COLUMN IF NOT EXISTS song_items jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.service_template_slots SET song_items = (SELECT coalesce(jsonb_agg(jsonb_build_object('title', s, 'leader_name', '', 'key', '')), '[]'::jsonb) FROM unnest(songs) s) WHERE song_items = '[]'::jsonb AND cardinality(songs) > 0;
UPDATE public.service_instance_slots SET song_items = (SELECT coalesce(jsonb_agg(jsonb_build_object('title', s, 'leader_name', '', 'key', '')), '[]'::jsonb) FROM unnest(songs) s) WHERE song_items = '[]'::jsonb AND cardinality(songs) > 0;

CREATE OR REPLACE FUNCTION public.update_service_slot_song_items(_slot_id uuid, _items jsonb)
RETURNS public.service_instance_slots
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_slot public.service_instance_slots;
BEGIN
  SELECT * INTO v_slot FROM public.service_instance_slots WHERE id = _slot_id;
  IF v_slot.id IS NULL THEN RAISE EXCEPTION 'Slot not found'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin')
    OR (v_slot.team_id IS NOT NULL AND public.is_team_member(auth.uid(), v_slot.team_id))) THEN
    RAISE EXCEPTION 'Not allowed to update songs for this slot';
  END IF;
  IF jsonb_typeof(coalesce(_items,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Items must be an array'; END IF;
  UPDATE public.service_instance_slots
  SET song_items = coalesce(_items,'[]'::jsonb),
      songs = coalesce((SELECT array_agg(e->>'title') FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) e), '{}'::text[]),
      updated_at = now()
  WHERE id = _slot_id RETURNING * INTO v_slot;
  RETURN v_slot;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_service_slot_song_items(uuid, jsonb) TO authenticated;
ALTER POLICY "Users can update own profile" ON public.profiles
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.manage_welcome_devices(_attendee_id uuid DEFAULT NULL, _user_id uuid DEFAULT NULL, _revoke boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer; linked_attendee uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _attendee_id IS NULL AND _user_id IS NULL THEN RAISE EXCEPTION 'Select a person'; END IF;
  linked_attendee := _attendee_id;
  IF _user_id IS NOT NULL THEN
    SELECT attendee_id INTO linked_attendee FROM public.profiles WHERE user_id = _user_id;
    IF _attendee_id IS NOT NULL AND linked_attendee IS DISTINCT FROM _attendee_id THEN RAISE EXCEPTION 'Person does not match'; END IF;
  END IF;
  IF _revoke THEN
    UPDATE public.welcome_device_tokens t SET expires_at = now()
    WHERE t.expires_at > now() AND (
      t.attendee_id = linked_attendee OR t.user_id = _user_id OR
      t.user_id IN (SELECT p.user_id FROM public.profiles p WHERE p.attendee_id = linked_attendee));
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    SELECT count(*)::integer INTO n FROM public.welcome_device_tokens t
    WHERE t.expires_at > now() AND (
      t.attendee_id = linked_attendee OR t.user_id = _user_id OR
      t.user_id IN (SELECT p.user_id FROM public.profiles p WHERE p.attendee_id = linked_attendee));
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.manage_welcome_devices(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_welcome_devices(uuid, uuid, boolean) TO authenticated;
COMMENT ON FUNCTION public.manage_welcome_devices(uuid, uuid, boolean) IS 'Admin-only active paired-device count/revocation across linked identities; never exposes recognition tokens.';

CREATE POLICY "Admins can delete sequence runs"
ON public.outreach_sequence_runs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.purge_outreach_runs(_status text DEFAULT 'skipped', _older_than_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF _status NOT IN ('skipped','failed') THEN
    RAISE EXCEPTION 'Invalid status for purge: %', _status;
  END IF;
  DELETE FROM public.outreach_sequence_runs
  WHERE status = _status
    AND sent_at < now() - make_interval(days => GREATEST(_older_than_days, 1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

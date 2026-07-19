
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS security_code text;
CREATE INDEX IF NOT EXISTS check_ins_security_code_idx ON public.check_ins(service_id, security_code);

CREATE OR REPLACE FUNCTION public.auto_close_stale_check_ins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.check_ins
  SET checked_out_at = now()
  WHERE checked_out_at IS NULL
    AND checked_in_at < now() - interval '12 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_old_check_ins(_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.check_ins
  WHERE checked_out_at IS NOT NULL
    AND checked_out_at < now() - make_interval(days => GREATEST(_days, 1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Nightly stale-checkout cleanup at 02:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('auto-close-stale-check-ins') 
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-close-stale-check-ins');
    PERFORM cron.schedule(
      'auto-close-stale-check-ins',
      '0 2 * * *',
      $CRON$ SELECT public.auto_close_stale_check_ins(); $CRON$
    );
  END IF;
END $$;

-- Automatically run the outreach dispatcher every 5 minutes so approved
-- + scheduled outreach messages send at their scheduled time without
-- requiring a manual "Run dispatcher now" click.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.call_outreach_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  v_url := current_setting('app.supabase_url', true) || '/functions/v1/outreach-dispatch';
  v_key := current_setting('app.service_role_key', true);

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'call_outreach_dispatch: app.supabase_url or app.service_role_key not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::text
  );
END;
$$;

-- Unschedule any prior version, then schedule every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('outreach-dispatch-every-5m');
EXCEPTION WHEN OTHERS THEN
  -- job did not exist
  NULL;
END $$;

SELECT cron.schedule(
  'outreach-dispatch-every-5m',
  '*/5 * * * *',
  'SELECT public.call_outreach_dispatch()'
);
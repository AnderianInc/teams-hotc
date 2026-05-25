CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT,
  phone_last10 TEXT NOT NULL UNIQUE,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'inbound_stop',
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_last10 ON public.sms_opt_outs(phone_last10);

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and FI can read sms opt-outs"
  ON public.sms_opt_outs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins manage sms opt-outs"
  ON public.sms_opt_outs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.is_phone_opted_out(_phone text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sms_opt_outs
    WHERE phone_last10 = right(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), 10)
      AND phone_last10 <> ''
  );
$$;

-- Backfill from existing do-not-contact + sms_opt_in=false rows
INSERT INTO public.sms_opt_outs (phone_e164, phone_last10, reason, source)
SELECT DISTINCT
  phone,
  right(regexp_replace(phone, '\D', '', 'g'), 10),
  'backfill: do_not_contact set and sms_opt_in false',
  'backfill'
FROM public.attendees
WHERE phone IS NOT NULL AND phone <> ''
  AND do_not_contact = true
  AND sms_opt_in = false
  AND length(right(regexp_replace(phone, '\D', '', 'g'), 10)) = 10
ON CONFLICT (phone_last10) DO NOTHING;

INSERT INTO public.sms_opt_outs (phone_e164, phone_last10, reason, source)
SELECT DISTINCT
  phone,
  right(regexp_replace(phone, '\D', '', 'g'), 10),
  'backfill: do_not_contact set and sms_opt_in false',
  'backfill'
FROM public.profiles
WHERE phone IS NOT NULL AND phone <> ''
  AND do_not_contact = true
  AND sms_opt_in = false
  AND length(right(regexp_replace(phone, '\D', '', 'g'), 10)) = 10
ON CONFLICT (phone_last10) DO NOTHING;
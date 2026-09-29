ALTER TABLE public.attendees ADD COLUMN phone_last10 text GENERATED ALWAYS AS (nullif(right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10), '')) STORED;
CREATE INDEX attendees_phone_last10_idx ON public.attendees (phone_last10) WHERE phone_last10 IS NOT NULL;

ALTER TABLE public.profiles ADD COLUMN phone_last10 text GENERATED ALWAYS AS (nullif(right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10), '')) STORED;
CREATE INDEX profiles_phone_last10_idx ON public.profiles (phone_last10) WHERE phone_last10 IS NOT NULL;

ALTER TABLE public.attendees ADD COLUMN welcome_sms_sent_at timestamp with time zone;
UPDATE public.attendees SET welcome_sms_sent_at = created_at + interval '23 hours' WHERE 'welcome_followup_sms_sent' = ANY(COALESCE(tags, '{}'::text[]));
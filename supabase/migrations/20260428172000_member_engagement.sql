-- member_engagement view: per-user attendance + volunteer participation stats
CREATE OR REPLACE VIEW public.member_engagement AS
SELECT
  p.id AS user_id,
  p.full_name,
  p.email,
  COUNT(DISTINCT wa.id) FILTER (
    WHERE wa.service_date >= (now() - interval '90 days')::date
  ) AS attendance_90d,
  COUNT(DISTINCT re.id) FILTER (
    WHERE ev.date >= (now() - interval '90 days')::date
  ) AS roster_participations_90d,
  MAX(wa.service_date) AS last_attendance_date,
  EXTRACT(DAY FROM now() - MAX(wa.service_date)::timestamptz)::int AS days_since_last_attendance,
  CASE
    WHEN MAX(wa.service_date) >= (now() - interval '14 days')::date THEN 'active'
    WHEN MAX(wa.service_date) >= (now() - interval '35 days')::date THEN 'drifting'
    WHEN MAX(wa.service_date) >= (now() - interval '63 days')::date THEN 'at_risk'
    ELSE 'inactive'
  END AS engagement_band
FROM public.profiles p
LEFT JOIN public.weekly_attendance wa ON wa.user_id = p.id
LEFT JOIN public.roster_entries re ON re.user_id = p.id
LEFT JOIN public.roster_events ev ON ev.id = re.event_id
GROUP BY p.id, p.full_name, p.email;

-- Allow authenticated users to query their own row; admins see all via service role
CREATE POLICY "Users see own engagement; admins see all"
  ON public.member_engagement FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

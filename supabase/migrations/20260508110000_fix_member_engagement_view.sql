-- Fix member_engagement view: joins were using p.id (internal UUID) instead of
-- p.user_id (auth ID), causing all attendance/roster joins to return NULL.
-- Also simplify roster_participations_90d to use scheduled_date directly.

CREATE OR REPLACE VIEW public.member_engagement AS
SELECT
  p.user_id,
  p.full_name,
  p.email,
  COUNT(DISTINCT wa.id) FILTER (
    WHERE wa.service_date >= (now() - interval '90 days')::date
  ) AS attendance_90d,
  COUNT(DISTINCT re.id) FILTER (
    WHERE re.scheduled_date >= (now() - interval '90 days')::date
  ) AS roster_participations_90d,
  MAX(wa.service_date) AS last_attendance_date,
  EXTRACT(DAY FROM now() - MAX(wa.service_date)::timestamptz)::int AS days_since_last_attendance,
  CASE
    WHEN MAX(wa.service_date) >= (now() - interval '14 days')::date  THEN 'active'
    WHEN MAX(wa.service_date) >= (now() - interval '35 days')::date  THEN 'drifting'
    WHEN MAX(wa.service_date) >= (now() - interval '63 days')::date  THEN 'at_risk'
    ELSE 'inactive'
  END AS engagement_band
FROM public.profiles p
LEFT JOIN public.weekly_attendance wa ON wa.user_id = p.user_id
LEFT JOIN public.roster_entries  re ON re.user_id = p.user_id
GROUP BY p.user_id, p.full_name, p.email;

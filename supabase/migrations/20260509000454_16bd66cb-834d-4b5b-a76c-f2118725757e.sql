CREATE OR REPLACE VIEW public.member_engagement
WITH (security_invoker = true)
AS
WITH engagement_people AS (
  SELECT
    p.user_id,
    p.attendee_id,
    NULLIF(TRIM(p.full_name), '') AS full_name,
    NULLIF(TRIM(p.email), '') AS email,
    'profile'::text AS source
  FROM public.profiles p

  UNION ALL

  SELECT
    NULL::uuid AS user_id,
    a.id AS attendee_id,
    NULLIF(TRIM(CONCAT_WS(' ', a.first_name, a.last_name)), '') AS full_name,
    NULLIF(TRIM(a.email), '') AS email,
    'attendee'::text AS source
  FROM public.attendees a
  LEFT JOIN public.profiles p ON p.attendee_id = a.id
  WHERE a.is_member = true
    AND p.id IS NULL
), attendance_stats AS (
  SELECT
    ep.user_id,
    ep.attendee_id,
    COUNT(DISTINCT wa.id) FILTER (
      WHERE wa.service_date >= (now() - interval '90 days')::date
        AND wa.status IN ('present', 'late')
    ) AS attendance_90d,
    MAX(wa.service_date) FILTER (
      WHERE wa.status IN ('present', 'late')
    ) AS last_attendance_date
  FROM engagement_people ep
  LEFT JOIN public.weekly_attendance wa
    ON (ep.user_id IS NOT NULL AND wa.user_id = ep.user_id)
    OR (ep.attendee_id IS NOT NULL AND wa.attendee_id = ep.attendee_id)
  GROUP BY ep.user_id, ep.attendee_id
), roster_stats AS (
  SELECT
    ep.user_id,
    COUNT(DISTINCT re.id) FILTER (
      WHERE re.scheduled_date >= (now() - interval '90 days')::date
    ) AS roster_participations_90d
  FROM engagement_people ep
  LEFT JOIN public.roster_entries re ON ep.user_id IS NOT NULL AND re.user_id = ep.user_id
  GROUP BY ep.user_id
)
SELECT
  COALESCE(ep.user_id, ep.attendee_id) AS engagement_id,
  ep.user_id,
  ep.attendee_id,
  COALESCE(ep.full_name, ep.email, 'Unknown') AS full_name,
  ep.email,
  COALESCE(ast.attendance_90d, 0)::bigint AS attendance_90d,
  COALESCE(rs.roster_participations_90d, 0)::bigint AS roster_participations_90d,
  ast.last_attendance_date,
  CASE
    WHEN ast.last_attendance_date IS NULL THEN NULL
    ELSE (CURRENT_DATE - ast.last_attendance_date)::int
  END AS days_since_last_attendance,
  CASE
    WHEN ast.last_attendance_date >= (now() - interval '14 days')::date THEN 'active'
    WHEN ast.last_attendance_date >= (now() - interval '35 days')::date THEN 'drifting'
    WHEN ast.last_attendance_date >= (now() - interval '63 days')::date THEN 'at_risk'
    ELSE 'inactive'
  END AS engagement_band,
  ep.source
FROM engagement_people ep
LEFT JOIN attendance_stats ast
  ON ast.user_id IS NOT DISTINCT FROM ep.user_id
 AND ast.attendee_id IS NOT DISTINCT FROM ep.attendee_id
LEFT JOIN roster_stats rs
  ON rs.user_id IS NOT DISTINCT FROM ep.user_id;

GRANT SELECT ON public.member_engagement TO authenticated;
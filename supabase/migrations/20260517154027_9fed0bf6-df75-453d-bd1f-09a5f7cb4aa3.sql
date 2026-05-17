UPDATE public.outreach_sequence_runs r
SET scheduled_for = (
  CASE WHEN s.anchor = 'event_date' THEN er.event_date::timestamptz ELSE er.received_at END
) + (s.offset_days || ' days')::interval
FROM public.outreach_sequences s, public.external_records er
WHERE r.scheduled_for IS NULL
  AND r.sequence_id = s.id
  AND r.external_record_id = er.id
  AND COALESCE(er.event_date::text, er.received_at::text) IS NOT NULL;
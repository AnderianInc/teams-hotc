UPDATE public.outreach_sequence_runs
SET status = 'skipped',
    detail = COALESCE(NULLIF(detail,''), '') ||
             CASE WHEN COALESCE(detail,'') = '' THEN '' ELSE ' | ' END ||
             'auto-skip: already sent on ' || to_char(sent_at, 'YYYY-MM-DD')
WHERE status = 'approved'
  AND sent_at IS NOT NULL;
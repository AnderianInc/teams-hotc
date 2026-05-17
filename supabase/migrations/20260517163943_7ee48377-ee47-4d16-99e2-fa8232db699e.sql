ALTER TABLE public.outreach_sequence_runs
DROP CONSTRAINT IF EXISTS outreach_sequence_runs_status_check;

ALTER TABLE public.outreach_sequence_runs
ADD CONSTRAINT outreach_sequence_runs_status_check
CHECK (status IN ('sent', 'skipped', 'failed', 'pending_approval', 'approved'));

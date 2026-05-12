
-- Roster response tracking
ALTER TABLE public.roster_entries
  ADD COLUMN IF NOT EXISTS response_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- Allow the assignee to update their own roster entry (status/reason)
DROP POLICY IF EXISTS "Assignee can respond to own roster entry" ON public.roster_entries;
CREATE POLICY "Assignee can respond to own roster entry"
ON public.roster_entries
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Date-range availability blocking
ALTER TABLE public.volunteer_blocked_dates
  ADD COLUMN IF NOT EXISTS end_date date;

UPDATE public.volunteer_blocked_dates
SET end_date = blocked_date
WHERE end_date IS NULL;

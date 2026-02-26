
-- Make user_id nullable so member-only check-ins can be recorded
ALTER TABLE public.weekly_attendance ALTER COLUMN user_id DROP NOT NULL;

-- Add partial unique index to prevent duplicate volunteer check-ins per service date
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_attendance_user_date 
ON public.weekly_attendance (service_date, user_id) 
WHERE user_id IS NOT NULL;

-- Add partial unique index to prevent duplicate member check-ins per service date
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_attendance_attendee_date 
ON public.weekly_attendance (service_date, attendee_id) 
WHERE attendee_id IS NOT NULL;

-- Add index on attendee_id for efficient member lookups
CREATE INDEX IF NOT EXISTS idx_weekly_attendance_attendee_id 
ON public.weekly_attendance (attendee_id) 
WHERE attendee_id IS NOT NULL;

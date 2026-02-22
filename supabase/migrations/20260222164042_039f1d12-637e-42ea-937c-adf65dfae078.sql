
-- Add attendee_id to profiles to link volunteers to church directory
ALTER TABLE public.profiles
  ADD COLUMN attendee_id uuid REFERENCES public.attendees(id) ON DELETE SET NULL;

-- Add visitor registration fields to attendees
ALTER TABLE public.attendees
  ADD COLUMN how_heard text,
  ADD COLUMN prayer_requests text;

ALTER TABLE public.service_slot_assignments ADD COLUMN guest_name text;
ALTER TABLE public.service_slot_assignments DROP CONSTRAINT service_slot_assignments_assignee_type_check;
ALTER TABLE public.service_slot_assignments ADD CONSTRAINT service_slot_assignments_assignee_type_check CHECK (assignee_type IN ('profile', 'attendee', 'guest'));
ALTER TABLE public.service_slot_assignments DROP CONSTRAINT service_slot_assignments_check;
ALTER TABLE public.service_slot_assignments ADD CONSTRAINT service_slot_assignments_check CHECK (
 (assignee_type = 'profile' AND profile_id IS NOT NULL AND attendee_id IS NULL AND guest_name IS NULL)
 OR (assignee_type = 'attendee' AND attendee_id IS NOT NULL AND profile_id IS NULL AND guest_name IS NULL)
 OR (assignee_type = 'guest' AND profile_id IS NULL AND attendee_id IS NULL AND roster_entry_id IS NULL AND guest_name IS NOT NULL AND length(btrim(guest_name)) > 0)
);
COMMENT ON COLUMN public.service_slot_assignments.guest_name IS 'Guest display name for this service slot only; does not create a directory person or volunteer roster entry.';
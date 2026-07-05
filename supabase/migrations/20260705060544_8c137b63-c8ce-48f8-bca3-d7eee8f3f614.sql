-- Tighten Order of Service read access to match admin-edit / team-view behavior

DROP POLICY IF EXISTS "Auth read services" ON public.service_instances;
DROP POLICY IF EXISTS "Auth read service slots" ON public.service_instance_slots;
DROP POLICY IF EXISTS "Auth read assignments" ON public.service_slot_assignments;

CREATE POLICY "Team users can read published services for their teams"
ON public.service_instances
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    status = 'published'
    AND roster_event_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.roster_event_teams ret
      WHERE ret.event_id = service_instances.roster_event_id
        AND public.is_team_member(auth.uid(), ret.team_id)
    )
  )
);

CREATE POLICY "Team users can read published service slots for their teams"
ON public.service_instance_slots
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.service_instances si
    JOIN public.roster_event_teams ret ON ret.event_id = si.roster_event_id
    WHERE si.id = service_instance_slots.instance_id
      AND si.status = 'published'
      AND public.is_team_member(auth.uid(), ret.team_id)
  )
);

CREATE POLICY "Team users can read published service assignments for their teams"
ON public.service_slot_assignments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.service_instance_slots sis
    JOIN public.service_instances si ON si.id = sis.instance_id
    JOIN public.roster_event_teams ret ON ret.event_id = si.roster_event_id
    WHERE sis.id = service_slot_assignments.slot_id
      AND si.status = 'published'
      AND public.is_team_member(auth.uid(), ret.team_id)
  )
);
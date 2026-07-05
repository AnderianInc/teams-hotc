-- Restrict master schedule creation/editing to admins while preserving team assignment workflows

-- roster_events: admin owns the master schedule; team users can view events attached to their teams
DROP POLICY IF EXISTS "Authenticated can read roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Admins can manage roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can insert roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can update roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can delete roster events" ON public.roster_events;

CREATE POLICY "Admins can manage master schedule events"
ON public.roster_events
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Team users can read their scheduled events"
ON public.roster_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.roster_event_teams ret
    WHERE ret.event_id = roster_events.id
      AND public.is_team_member(auth.uid(), ret.team_id)
  )
);

-- roster_event_teams: admin owns service/team setup; team users can view their own team's links
DROP POLICY IF EXISTS "Authenticated can read event teams" ON public.roster_event_teams;
DROP POLICY IF EXISTS "Admins can manage event teams" ON public.roster_event_teams;
DROP POLICY IF EXISTS "Team leads can insert event teams" ON public.roster_event_teams;
DROP POLICY IF EXISTS "Team leads can delete event teams" ON public.roster_event_teams;

CREATE POLICY "Admins can manage master schedule teams"
ON public.roster_event_teams
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Team users can read their schedule team links"
ON public.roster_event_teams
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_team_member(auth.uid(), team_id)
);

-- roster_entries policies remain the team assignment layer:
-- admins/team leads manage team assignments; assignees can respond to their own rows.
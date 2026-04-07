
DROP POLICY IF EXISTS "Team leads can insert roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can delete roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can update roster events" ON public.roster_events;

CREATE OR REPLACE FUNCTION public.is_any_team_lead(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND role = 'team_lead'
  )
$$;

CREATE POLICY "Team leads can insert roster events"
ON public.roster_events FOR INSERT TO authenticated
WITH CHECK (public.is_any_team_lead(auth.uid()));

CREATE POLICY "Team leads can update roster events"
ON public.roster_events FOR UPDATE TO authenticated
USING (
  public.is_any_team_lead(auth.uid())
  OR (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id))
);

CREATE POLICY "Team leads can delete roster events"
ON public.roster_events FOR DELETE TO authenticated
USING (
  public.is_any_team_lead(auth.uid())
  OR (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id))
);

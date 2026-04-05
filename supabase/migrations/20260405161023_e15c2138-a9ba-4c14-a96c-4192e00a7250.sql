
-- Junction table: events can have multiple teams
CREATE TABLE public.roster_event_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.roster_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (event_id, team_id)
);

ALTER TABLE public.roster_event_teams ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Authenticated can read event teams"
ON public.roster_event_teams FOR SELECT TO authenticated
USING (true);

-- Admins can do everything
CREATE POLICY "Admins can manage event teams"
ON public.roster_event_teams FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Team leads can insert their team
CREATE POLICY "Team leads can insert event teams"
ON public.roster_event_teams FOR INSERT TO authenticated
WITH CHECK (is_team_lead(auth.uid(), team_id));

-- Team leads can delete their team assignment
CREATE POLICY "Team leads can delete event teams"
ON public.roster_event_teams FOR DELETE TO authenticated
USING (is_team_lead(auth.uid(), team_id));

-- Make roster_events.team_id nullable (events are now top-level)
ALTER TABLE public.roster_events ALTER COLUMN team_id DROP NOT NULL;

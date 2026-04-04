
-- Create roster_events table
CREATE TABLE public.roster_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME WITHOUT TIME ZONE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.roster_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read roster events"
  ON public.roster_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage roster events"
  ON public.roster_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Team leads can insert roster events"
  ON public.roster_events FOR INSERT TO authenticated
  WITH CHECK (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id));

CREATE POLICY "Team leads can update roster events"
  ON public.roster_events FOR UPDATE TO authenticated
  USING (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id));

CREATE POLICY "Team leads can delete roster events"
  ON public.roster_events FOR DELETE TO authenticated
  USING (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id));

-- Add event_id to roster_entries
ALTER TABLE public.roster_entries
  ADD COLUMN event_id UUID REFERENCES public.roster_events(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX idx_roster_events_date ON public.roster_events(event_date);
CREATE INDEX idx_roster_entries_event ON public.roster_entries(event_id);

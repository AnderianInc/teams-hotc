
-- Create team_role_types table for per-team role definitions
CREATE TABLE public.team_role_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (team_id, name)
);

ALTER TABLE public.team_role_types ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Authenticated can read team role types"
  ON public.team_role_types FOR SELECT TO authenticated
  USING (true);

-- Admins can manage all
CREATE POLICY "Admins can manage team role types"
  ON public.team_role_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Team leads can manage their team's role types
CREATE POLICY "Team leads can insert role types"
  ON public.team_role_types FOR INSERT TO authenticated
  WITH CHECK (is_team_lead(auth.uid(), team_id));

CREATE POLICY "Team leads can update role types"
  ON public.team_role_types FOR UPDATE TO authenticated
  USING (is_team_lead(auth.uid(), team_id));

CREATE POLICY "Team leads can delete role types"
  ON public.team_role_types FOR DELETE TO authenticated
  USING (is_team_lead(auth.uid(), team_id));

-- Drop the duplicate unique constraint on team_members
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_team_user_unique;

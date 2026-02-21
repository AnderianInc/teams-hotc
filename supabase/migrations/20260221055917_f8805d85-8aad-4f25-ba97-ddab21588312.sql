
-- Fix infinite recursion: create security definer function for team lead check
CREATE OR REPLACE FUNCTION public.is_team_lead(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id AND role = 'team_lead'
  )
$$;

-- Drop recursive policies
DROP POLICY "Team leads can read team memberships" ON public.team_members;
DROP POLICY "Team leads can manage team memberships" ON public.team_members;

-- Recreate with security definer function
CREATE POLICY "Team leads can read team memberships" ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_team_lead(auth.uid(), team_id));

CREATE POLICY "Team leads can insert team memberships" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_lead(auth.uid(), team_id));

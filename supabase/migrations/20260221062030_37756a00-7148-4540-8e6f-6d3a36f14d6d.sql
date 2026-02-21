-- Add unique constraint for upsert support
ALTER TABLE public.team_members ADD CONSTRAINT team_members_team_user_unique UNIQUE (team_id, user_id);

-- Allow team leads to delete members from their team
CREATE POLICY "Team leads can delete team members"
ON public.team_members
FOR DELETE
USING (is_team_lead(auth.uid(), team_id) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow team leads to update member roles in their team
CREATE POLICY "Team leads can update team members"
ON public.team_members
FOR UPDATE
USING (is_team_lead(auth.uid(), team_id) OR has_role(auth.uid(), 'admin'::app_role));
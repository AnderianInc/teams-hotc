-- Public pages (e.g. /interest-meeting, /join-team) query volunteer teams with the
-- anon client; without this policy the list comes back empty for logged-out visitors.
CREATE POLICY "Anyone can read volunteer teams"
ON public.teams
FOR SELECT
TO anon
USING (team_type = 'volunteer');
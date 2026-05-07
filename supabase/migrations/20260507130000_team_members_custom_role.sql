ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS custom_role text;

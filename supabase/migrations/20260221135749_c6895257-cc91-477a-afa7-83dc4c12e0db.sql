
-- 1. Add FK from team_members.user_id to profiles.user_id
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- 2. Update RLS SELECT on families to also allow First Impressions members
DROP POLICY IF EXISTS "Kids ministry can read families" ON public.families;
CREATE POLICY "Kids or FI can read families"
  ON public.families FOR SELECT
  USING (
    is_kids_ministry_member(auth.uid())
    OR is_first_impressions_member(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. Update RLS SELECT on children to also allow First Impressions members
DROP POLICY IF EXISTS "Kids ministry can read children" ON public.children;
CREATE POLICY "Kids or FI can read children"
  ON public.children FOR SELECT
  USING (
    is_kids_ministry_member(auth.uid())
    OR is_first_impressions_member(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

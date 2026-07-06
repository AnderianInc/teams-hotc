DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin')
    OR (
      is_staff IS NOT DISTINCT FROM (SELECT p.is_staff FROM public.profiles p WHERE p.user_id = auth.uid())
      AND staff_role_id IS NOT DISTINCT FROM (SELECT p.staff_role_id FROM public.profiles p WHERE p.user_id = auth.uid())
      AND org_team_id IS NOT DISTINCT FROM (SELECT p.org_team_id FROM public.profiles p WHERE p.user_id = auth.uid())
      AND reports_to_user_id IS NOT DISTINCT FROM (SELECT p.reports_to_user_id FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);
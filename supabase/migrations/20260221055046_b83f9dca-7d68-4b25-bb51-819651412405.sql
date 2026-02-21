
-- Fix the overly permissive profiles insert policy
DROP POLICY "System inserts profiles" ON public.profiles;
-- Only allow service_role (trigger) or users inserting their own profile
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

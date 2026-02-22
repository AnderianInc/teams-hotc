
-- Add FK from roster_entries.user_id to profiles.user_id so PostgREST can resolve the join
ALTER TABLE public.roster_entries
  ADD CONSTRAINT roster_entries_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);

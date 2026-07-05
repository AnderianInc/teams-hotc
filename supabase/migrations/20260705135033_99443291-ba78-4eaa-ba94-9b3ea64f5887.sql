
-- 1. Restrict avatar listing (public bucket URLs still work for direct file access)
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;

CREATE POLICY "Users read own avatars"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 2. Prevent self-elevation of staff/org fields on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_staff IS DISTINCT FROM OLD.is_staff
     OR NEW.staff_role_id IS DISTINCT FROM OLD.staff_role_id
     OR NEW.org_team_id IS DISTINCT FROM OLD.org_team_id
     OR NEW.reports_to_user_id IS DISTINCT FROM OLD.reports_to_user_id THEN
    RAISE EXCEPTION 'Not authorized to modify staff or org fields on profile';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

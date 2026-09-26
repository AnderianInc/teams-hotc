CREATE TABLE public.social_media_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL UNIQUE,
  name text NOT NULL,
  mime_type text,
  web_view_link text,
  folder_date date,
  caption text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.social_media_photos TO authenticated;
GRANT ALL ON public.social_media_photos TO service_role;
ALTER TABLE public.social_media_photos ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.is_social_media_member(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = _user_id AND t.slug = 'social-media')
$$;
CREATE POLICY "Social media members and admins view photos" ON public.social_media_photos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_social_media_member(auth.uid()));
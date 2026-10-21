CREATE OR REPLACE FUNCTION public.is_young_adults_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = _user_id AND t.slug = 'young-adults')
$$;

CREATE TABLE public.young_adult_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, service_date)
);
GRANT SELECT, INSERT, DELETE ON public.young_adult_attendance TO authenticated;
GRANT ALL ON public.young_adult_attendance TO service_role;
ALTER TABLE public.young_adult_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "YA team reads attendance" ON public.young_adult_attendance FOR SELECT TO authenticated
  USING (public.is_young_adults_member(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "YA team marks attendance" ON public.young_adult_attendance FOR INSERT TO authenticated
  WITH CHECK (public.is_young_adults_member(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "YA team unmarks attendance" ON public.young_adult_attendance FOR DELETE TO authenticated
  USING (public.is_young_adults_member(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Young adults team can read students" ON public.children FOR SELECT TO authenticated
  USING (public.is_young_adults_member(auth.uid()) AND grade_group = 'Young Adults');
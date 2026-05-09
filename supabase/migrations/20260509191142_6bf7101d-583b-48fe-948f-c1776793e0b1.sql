
-- Staff roles list
CREATE TABLE public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read staff roles"
  ON public.staff_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage staff roles"
  ON public.staff_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER staff_roles_updated_at
  BEFORE UPDATE ON public.staff_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add staff/org fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_title text,
  ADD COLUMN IF NOT EXISTS reports_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS org_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_reports_to ON public.profiles(reports_to_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_team ON public.profiles(org_team_id);

-- Admin-only policy for org/staff field updates (supplements existing user self-update)
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed common church staff roles
INSERT INTO public.staff_roles (name, sort_order) VALUES
  ('Lead Pastor', 1),
  ('Associate Pastor', 2),
  ('Executive Pastor', 3),
  ('Worship Director', 4),
  ('Kids Ministry Director', 5),
  ('Youth Pastor', 6),
  ('Operations Manager', 7),
  ('Administrative Assistant', 8),
  ('Communications Director', 9),
  ('Outreach Coordinator', 10)
ON CONFLICT (name) DO NOTHING;

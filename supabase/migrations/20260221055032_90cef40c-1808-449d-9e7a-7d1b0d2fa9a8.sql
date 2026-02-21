
-- Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'team_lead', 'member');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table (separate from profiles per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members junction table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Families table
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_name TEXT NOT NULL,
  parent1_name TEXT NOT NULL,
  parent1_phone TEXT NOT NULL,
  parent2_name TEXT,
  parent2_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- Children table
CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  grade_group TEXT,
  allergies TEXT,
  medical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- Rooms table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_age INT,
  max_age INT,
  grade_group TEXT,
  capacity INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Services table
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_time TIME,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Check-ins table
CREATE TABLE public.check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  checked_in_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at TIMESTAMPTZ
);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at columns
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_families_updated_at BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_children_updated_at BEFORE UPDATE ON public.children FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: check if user is a member of the kids ministry team
CREATE OR REPLACE FUNCTION public.is_kids_ministry_member(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = _user_id AND t.slug = 'childrens-ministry'
  )
$$;

-- RLS POLICIES

-- Profiles: users can read all profiles, update own
CREATE POLICY "Anyone authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System inserts profiles" ON public.profiles FOR INSERT WITH CHECK (true);

-- User roles: admins can manage, users can read own
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Teams: all authenticated can read, admins can manage
CREATE POLICY "Authenticated can read teams" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage teams" ON public.teams FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Team members: members can read their teams, admins and team leads can manage
CREATE POLICY "Users can read own memberships" ON public.team_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all memberships" ON public.team_members FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage memberships" ON public.team_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team leads can read team memberships" ON public.team_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_members tl
    WHERE tl.team_id = team_members.team_id AND tl.user_id = auth.uid() AND tl.role = 'team_lead'
  ));
CREATE POLICY "Team leads can manage team memberships" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tl
    WHERE tl.team_id = team_members.team_id AND tl.user_id = auth.uid() AND tl.role = 'team_lead'
  ));

-- Families: kids ministry members and admins
CREATE POLICY "Kids ministry can read families" ON public.families FOR SELECT TO authenticated
  USING (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Kids ministry can insert families" ON public.families FOR INSERT TO authenticated
  WITH CHECK (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Kids ministry can update families" ON public.families FOR UPDATE TO authenticated
  USING (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Children: same as families
CREATE POLICY "Kids ministry can read children" ON public.children FOR SELECT TO authenticated
  USING (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Kids ministry can insert children" ON public.children FOR INSERT TO authenticated
  WITH CHECK (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Kids ministry can update children" ON public.children FOR UPDATE TO authenticated
  USING (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Rooms: kids ministry and admins
CREATE POLICY "Kids ministry can read rooms" ON public.rooms FOR SELECT TO authenticated
  USING (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins and leads can manage rooms" ON public.rooms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Services: all authenticated can read, admins manage
CREATE POLICY "Authenticated can read services" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage services" ON public.services FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Check-ins: kids ministry members
CREATE POLICY "Kids ministry can read check_ins" ON public.check_ins FOR SELECT TO authenticated
  USING (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Kids ministry can insert check_ins" ON public.check_ins FOR INSERT TO authenticated
  WITH CHECK (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Kids ministry can update check_ins" ON public.check_ins FOR UPDATE TO authenticated
  USING (public.is_kids_ministry_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Seed initial teams
INSERT INTO public.teams (name, slug, description) VALUES
  ('Children''s Ministry', 'childrens-ministry', 'Kids check-in and care during services'),
  ('Worship', 'worship', 'Worship team and musicians'),
  ('Media & Production', 'media-production', 'Sound, lighting, and media production'),
  ('Java Team', 'java-team', 'Coffee and refreshments ministry'),
  ('Ushers', 'ushers', 'Greeting and ushering'),
  ('First Impressions', 'first-impressions', 'Welcome and follow-up with new members');

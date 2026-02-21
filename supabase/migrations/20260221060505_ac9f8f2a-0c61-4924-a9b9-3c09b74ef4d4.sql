
-- Add team type to distinguish volunteer-only vs ministry teams
ALTER TABLE public.teams ADD COLUMN team_type TEXT NOT NULL DEFAULT 'volunteer';

-- Update existing teams
UPDATE public.teams SET team_type = 'ministry' WHERE slug IN ('childrens-ministry', 'first-impressions');

-- Church attendees table (accessible by First Impressions + Admins)
CREATE TABLE public.attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  first_visit_date DATE DEFAULT CURRENT_DATE,
  is_member BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_attendees_updated_at BEFORE UPDATE ON public.attendees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: check if user is a first impressions member
CREATE OR REPLACE FUNCTION public.is_first_impressions_member(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = _user_id AND t.slug = 'first-impressions'
  )
$$;

-- Attendee RLS
CREATE POLICY "First impressions can read attendees" ON public.attendees
  FOR SELECT TO authenticated
  USING (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "First impressions can insert attendees" ON public.attendees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "First impressions can update attendees" ON public.attendees
  FOR UPDATE TO authenticated
  USING (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Attendance records table
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID REFERENCES public.attendees(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "First impressions can read attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "First impressions can insert attendance" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Follow-ups table
CREATE TYPE public.followup_status AS ENUM ('pending', 'contacted', 'connected', 'no_response', 'closed');

CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id UUID REFERENCES public.attendees(id) ON DELETE CASCADE NOT NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status followup_status NOT NULL DEFAULT 'pending',
  method TEXT, -- call, text, visit, email
  notes TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "First impressions can read follow_ups" ON public.follow_ups
  FOR SELECT TO authenticated
  USING (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "First impressions can insert follow_ups" ON public.follow_ups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "First impressions can update follow_ups" ON public.follow_ups
  FOR UPDATE TO authenticated
  USING (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Roster/scheduling table for volunteer teams
CREATE TABLE public.roster_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scheduled_date DATE NOT NULL,
  role_description TEXT, -- e.g. "Lead Vocal", "Camera 1"
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.roster_entries ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is member of a specific team
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
  )
$$;

CREATE POLICY "Team members can read own roster" ON public.roster_entries
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team leads and admins can manage roster" ON public.roster_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_lead(auth.uid(), team_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team leads and admins can update roster" ON public.roster_entries
  FOR UPDATE TO authenticated
  USING (public.is_team_lead(auth.uid(), team_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team leads and admins can delete roster" ON public.roster_entries
  FOR DELETE TO authenticated
  USING (public.is_team_lead(auth.uid(), team_id) OR public.has_role(auth.uid(), 'admin'));

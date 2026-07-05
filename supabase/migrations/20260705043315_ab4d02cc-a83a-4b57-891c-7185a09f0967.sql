
-- Templates
CREATE TABLE public.service_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_start_time TIME,
  default_duration_minutes INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_templates TO authenticated;
GRANT ALL ON public.service_templates TO service_role;
ALTER TABLE public.service_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read templates" ON public.service_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/leads manage templates" ON public.service_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()));

CREATE TABLE public.service_template_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.service_templates(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 5,
  notes TEXT,
  default_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  default_role_type_id UUID REFERENCES public.team_role_types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_template_slots_template ON public.service_template_slots(template_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_template_slots TO authenticated;
GRANT ALL ON public.service_template_slots TO service_role;
ALTER TABLE public.service_template_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read template slots" ON public.service_template_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/leads manage template slots" ON public.service_template_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()));

-- Instances (a specific Sunday)
CREATE TABLE public.service_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.service_templates(id) ON DELETE SET NULL,
  roster_event_id UUID REFERENCES public.roster_events(id) ON DELETE SET NULL,
  service_date DATE NOT NULL,
  start_time TIME,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_instances_date ON public.service_instances(service_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_instances TO authenticated;
GRANT ALL ON public.service_instances TO service_role;
ALTER TABLE public.service_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read services" ON public.service_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/leads manage services" ON public.service_instances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()));

CREATE TABLE public.service_instance_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.service_instances(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 5,
  notes TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  role_type_id UUID REFERENCES public.team_role_types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_instance_slots_instance ON public.service_instance_slots(instance_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_instance_slots TO authenticated;
GRANT ALL ON public.service_instance_slots TO service_role;
ALTER TABLE public.service_instance_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read service slots" ON public.service_instance_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/leads manage service slots" ON public.service_instance_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()));

-- Assignments
CREATE TABLE public.service_slot_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id UUID NOT NULL REFERENCES public.service_instance_slots(id) ON DELETE CASCADE,
  assignee_type TEXT NOT NULL CHECK (assignee_type IN ('profile','attendee')),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendee_id UUID REFERENCES public.attendees(id) ON DELETE CASCADE,
  role_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  roster_entry_id UUID REFERENCES public.roster_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((assignee_type = 'profile' AND profile_id IS NOT NULL AND attendee_id IS NULL)
      OR (assignee_type = 'attendee' AND attendee_id IS NOT NULL AND profile_id IS NULL))
);
CREATE INDEX idx_slot_assignments_slot ON public.service_slot_assignments(slot_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_slot_assignments TO authenticated;
GRANT ALL ON public.service_slot_assignments TO service_role;
ALTER TABLE public.service_slot_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read assignments" ON public.service_slot_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/leads manage assignments" ON public.service_slot_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_any_team_lead(auth.uid()));
CREATE POLICY "Assignee updates own status" ON public.service_slot_assignments FOR UPDATE TO authenticated
  USING (profile_id IS NOT NULL AND profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IS NOT NULL AND profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_service_templates_updated BEFORE UPDATE ON public.service_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_service_template_slots_updated BEFORE UPDATE ON public.service_template_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_service_instances_updated BEFORE UPDATE ON public.service_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_service_instance_slots_updated BEFORE UPDATE ON public.service_instance_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_service_slot_assignments_updated BEFORE UPDATE ON public.service_slot_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

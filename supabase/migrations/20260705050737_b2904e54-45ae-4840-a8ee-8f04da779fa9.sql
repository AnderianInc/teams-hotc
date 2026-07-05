
-- Restrict Order of Service writes to admins only; keep authenticated read; keep assignee self-update.

DROP POLICY IF EXISTS "Admins/leads manage templates" ON public.service_templates;
DROP POLICY IF EXISTS "Admins/leads manage template slots" ON public.service_template_slots;
DROP POLICY IF EXISTS "Admins/leads manage services" ON public.service_instances;
DROP POLICY IF EXISTS "Admins/leads manage service slots" ON public.service_instance_slots;
DROP POLICY IF EXISTS "Admins/leads manage assignments" ON public.service_slot_assignments;

CREATE POLICY "Admins manage templates" ON public.service_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage template slots" ON public.service_template_slots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage services" ON public.service_instances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage service slots" ON public.service_instance_slots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage assignments" ON public.service_slot_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

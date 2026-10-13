ALTER TABLE public.funnel_leads ADD COLUMN IF NOT EXISTS utm_term text, ADD COLUMN IF NOT EXISTS client_info jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT UPDATE ON public.funnel_messages TO authenticated;
CREATE POLICY "Admins and FI update funnel messages" ON public.funnel_messages FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));
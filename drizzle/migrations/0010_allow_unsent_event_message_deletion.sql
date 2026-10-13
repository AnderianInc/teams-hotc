GRANT DELETE ON public.funnel_messages TO authenticated;
CREATE POLICY "Admins and FI delete unsent event messages" ON public.funnel_messages FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_first_impressions_member(auth.uid())) AND status IN ('pending', 'review', 'failed', 'cancelled', 'skipped'));

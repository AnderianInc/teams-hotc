-- Allow first impressions members and admins to delete follow-ups
CREATE POLICY "First impressions can delete follow_ups" ON public.follow_ups
  FOR DELETE TO authenticated
  USING (public.is_first_impressions_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Allow admins and First Impressions members to delete follow-ups
CREATE POLICY "Admins and FI can delete follow_ups"
  ON public.follow_ups FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

-- FOLLOW_UPS: scope reads/updates/deletes to assignee for non-admins
DROP POLICY IF EXISTS "First impressions can read follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "First impressions can update follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Admins and FI can delete follow_ups" ON public.follow_ups;

CREATE POLICY "Admins or assignee can read follow_ups"
  ON public.follow_ups FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admins or assignee can update follow_ups"
  ON public.follow_ups FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Admins or assignee can delete follow_ups"
  ON public.follow_ups FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
  );

-- INSERT policy unchanged: any FI member or admin can create follow-ups

-- FOLLOW_UP_ACTIVITIES: scope to activities on follow-ups the user can see
DROP POLICY IF EXISTS "FI and admins read activities" ON public.follow_up_activities;
DROP POLICY IF EXISTS "FI and admins insert activities" ON public.follow_up_activities;

CREATE POLICY "Admins or assignee read activities"
  ON public.follow_up_activities FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.follow_ups fu
      WHERE fu.id = follow_up_activities.follow_up_id
        AND fu.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Admins or assignee insert activities"
  ON public.follow_up_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.follow_ups fu
      WHERE fu.id = follow_up_activities.follow_up_id
        AND fu.assigned_to = auth.uid()
    )
  );

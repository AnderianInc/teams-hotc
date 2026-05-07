
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage app settings" ON public.app_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated read app settings" ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.follow_up_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL,
  actor_id uuid,
  activity_type text NOT NULL,
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.follow_up_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "FI and admins read activities" ON public.follow_up_activities FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));
CREATE POLICY "FI and admins insert activities" ON public.follow_up_activities FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_follow_up_activities_follow_up_id ON public.follow_up_activities(follow_up_id);

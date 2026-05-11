
CREATE TABLE public.volunteer_blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  blocked_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, blocked_date)
);

ALTER TABLE public.volunteer_blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own blocked dates"
  ON public.volunteer_blocked_dates
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team leads and admins can read blocked dates"
  ON public.volunteer_blocked_dates
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_any_team_lead(auth.uid())
  );

CREATE INDEX idx_volunteer_blocked_dates_user_date
  ON public.volunteer_blocked_dates(user_id, blocked_date);

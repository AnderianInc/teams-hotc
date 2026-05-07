-- Volunteer scheduling preferences and availability windows
CREATE TABLE public.volunteer_availability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 0=Sunday … 6=Saturday; NULL means "any day"
  day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  time,            -- e.g. '09:00'
  end_time    time,            -- e.g. '13:00'
  available   boolean NOT NULL DEFAULT true,  -- false = blocked/unavailable
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.volunteer_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own availability"
  ON public.volunteer_availability FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Team leads and admins can view availability"
  ON public.volunteer_availability FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_any_team_lead(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE INDEX idx_volunteer_availability_user ON public.volunteer_availability(user_id);

-- Scheduling preferences (separate from specific windows)
CREATE TABLE public.volunteer_schedule_prefs (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  max_shifts_month  smallint,           -- max shifts per month they're willing to serve
  preferred_teams   text[],            -- team slugs they prefer
  preferred_roles   text[],            -- role types they prefer
  notes             text,              -- free-form notes for team lead
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.volunteer_schedule_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own prefs"
  ON public.volunteer_schedule_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Team leads and admins can view prefs"
  ON public.volunteer_schedule_prefs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_any_team_lead(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

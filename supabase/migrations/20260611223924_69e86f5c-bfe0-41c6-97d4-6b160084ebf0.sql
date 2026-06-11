
DO $$ BEGIN
  CREATE TYPE public.volunteer_onboarding_stage AS ENUM ('interested', 'training', 'volunteer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.volunteer_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id uuid NOT NULL REFERENCES public.attendees(id) ON DELETE CASCADE,
  stage public.volunteer_onboarding_stage NOT NULL DEFAULT 'interested',
  preferred_team_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  assigned_to uuid,
  notes text,
  source text NOT NULL DEFAULT 'join-team',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS volunteer_onboarding_attendee_active_idx
  ON public.volunteer_onboarding(attendee_id)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS volunteer_onboarding_stage_idx
  ON public.volunteer_onboarding(stage);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_onboarding TO authenticated;
GRANT ALL ON public.volunteer_onboarding TO service_role;

ALTER TABLE public.volunteer_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage volunteer onboarding"
  ON public.volunteer_onboarding FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff manage volunteer onboarding"
  ON public.volunteer_onboarding FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id WHERE tm.user_id = auth.uid() AND t.slug = 'staff'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id WHERE tm.user_id = auth.uid() AND t.slug = 'staff'));

CREATE POLICY "Team leads view onboarding for their teams"
  ON public.volunteer_onboarding FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'team_lead' AND tm.team_id = ANY(volunteer_onboarding.preferred_team_ids)));

CREATE POLICY "Team leads update onboarding for their teams"
  ON public.volunteer_onboarding FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'team_lead' AND tm.team_id = ANY(volunteer_onboarding.preferred_team_ids)));

CREATE TRIGGER update_volunteer_onboarding_updated_at
  BEFORE UPDATE ON public.volunteer_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.volunteer_onboarding (attendee_id, stage, source, notes, created_at)
SELECT DISTINCT ON (er.attendee_id)
  er.attendee_id,
  'interested'::public.volunteer_onboarding_stage,
  'imported-from-interest',
  'Imported from legacy interest meeting records.',
  er.received_at
FROM public.external_records er
WHERE er.source = 'interest'
  AND er.attendee_id IS NOT NULL
  AND er.status IN ('created', 'merged')
  AND EXISTS (SELECT 1 FROM public.attendees a WHERE a.id = er.attendee_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.volunteer_onboarding vo
    WHERE vo.attendee_id = er.attendee_id AND vo.completed_at IS NULL
  )
ORDER BY er.attendee_id, er.received_at ASC;

DROP FUNCTION IF EXISTS public.advance_interest_pipeline(uuid) CASCADE;
DROP TABLE IF EXISTS public.interest_meetings CASCADE;

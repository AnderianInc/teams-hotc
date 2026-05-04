-- Enhance follow_ups with type, stage, priority, and prospect pipeline
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'outreach'
    CHECK (type IN ('inreach', 'outreach')),
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS inreach_trigger text,
  ADD COLUMN IF NOT EXISTS prospect_pipeline_stage text
    CHECK (prospect_pipeline_stage IN (
      'interested', 'invited', 'visited', 'connected', 'member'
    ));

-- Activity log for each follow-up: full interaction timeline
CREATE TABLE public.follow_up_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL REFERENCES public.follow_ups(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  activity_type text NOT NULL
    CHECK (activity_type IN ('note', 'call', 'email', 'text', 'visit', 'status_change')),
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_up_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read follow-up activities"
  ON public.follow_up_activities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert follow-up activities"
  ON public.follow_up_activities FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE INDEX idx_follow_up_activities_follow_up
  ON public.follow_up_activities(follow_up_id, created_at);

-- 1. Account deletion requests table
CREATE TABLE public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own request
CREATE POLICY "Users can request own deletion"
  ON public.account_deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own requests
CREATE POLICY "Users can view own deletion requests"
  ON public.account_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can view all deletion requests"
  ON public.account_deletion_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Admins can update (approve/deny)
CREATE POLICY "Admins can update deletion requests"
  ON public.account_deletion_requests FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- 2. Feedback table
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id uuid REFERENCES public.teams(id),
  category text NOT NULL DEFAULT 'suggestion',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_response text,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can submit feedback
CREATE POLICY "Users can insert own feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Team leads can submit feedback for their team
CREATE POLICY "Team leads can insert team feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id));

-- Admins can read all feedback
CREATE POLICY "Admins can view all feedback"
  ON public.feedback FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Admins can update feedback (respond)
CREATE POLICY "Admins can update feedback"
  ON public.feedback FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
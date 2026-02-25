
-- Add 'staff' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- Create weekly attendance tracking table
CREATE TABLE public.weekly_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  attendee_id UUID REFERENCES public.attendees(id) ON DELETE CASCADE,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'excused', 'late')),
  checked_in_by UUID,
  is_self_reported BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_date),
  UNIQUE (attendee_id, service_date)
);

-- Enable RLS
ALTER TABLE public.weekly_attendance ENABLE ROW LEVEL SECURITY;

-- Admins and team leads can read all attendance
CREATE POLICY "Admins can manage all attendance"
  ON public.weekly_attendance FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Team leads can read attendance for their team members
CREATE POLICY "Team leads can read team attendance"
  ON public.weekly_attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = weekly_attendance.user_id
      AND public.is_team_lead(auth.uid(), tm.team_id)
    )
  );

-- Team leads can insert attendance for their team members
CREATE POLICY "Team leads can insert team attendance"
  ON public.weekly_attendance FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = weekly_attendance.user_id
      AND public.is_team_lead(auth.uid(), tm.team_id)
    )
  );

-- Users can self-report attendance
CREATE POLICY "Users can self-report attendance"
  ON public.weekly_attendance FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_self_reported = true);

-- Users can read own attendance
CREATE POLICY "Users can read own attendance"
  ON public.weekly_attendance FOR SELECT
  USING (auth.uid() = user_id);

-- Index for common queries
CREATE INDEX idx_weekly_attendance_date ON public.weekly_attendance (service_date DESC);
CREATE INDEX idx_weekly_attendance_user ON public.weekly_attendance (user_id);

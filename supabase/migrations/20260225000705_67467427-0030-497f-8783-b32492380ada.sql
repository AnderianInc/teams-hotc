
-- Table for tracking family relationships between attendees
CREATE TABLE public.attendee_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_attendee_id UUID NOT NULL REFERENCES public.attendees(id) ON DELETE CASCADE,
  to_attendee_id UUID NOT NULL REFERENCES public.attendees(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('spouse', 'parent', 'child', 'sibling')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(from_attendee_id, to_attendee_id, relationship_type)
);

ALTER TABLE public.attendee_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and FI can read relationships"
  ON public.attendee_relationships FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins and FI can insert relationships"
  ON public.attendee_relationships FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins can delete relationships"
  ON public.attendee_relationships FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update relationships"
  ON public.attendee_relationships FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

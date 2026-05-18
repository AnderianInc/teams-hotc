CREATE TABLE public.interest_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_date DATE NOT NULL,
  title TEXT,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (meeting_date)
);

ALTER TABLE public.interest_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage interest meetings"
ON public.interest_meetings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "FI can read interest meetings"
ON public.interest_meetings FOR SELECT TO authenticated
USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "FI can insert interest meetings"
ON public.interest_meetings FOR INSERT TO authenticated
WITH CHECK (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "FI can update interest meetings"
ON public.interest_meetings FOR UPDATE TO authenticated
USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_interest_meetings_updated
BEFORE UPDATE ON public.interest_meetings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
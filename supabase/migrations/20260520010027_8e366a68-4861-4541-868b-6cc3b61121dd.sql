
CREATE TABLE public.sms_inbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone text NOT NULL,
  to_phone text,
  body text NOT NULL,
  num_media int DEFAULT 0,
  media_urls text[] DEFAULT '{}',
  provider_message_id text UNIQUE,
  related_attendee_id uuid,
  from_name text,
  status text NOT NULL DEFAULT 'new',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_inbound_received_at ON public.sms_inbound (received_at DESC);
CREATE INDEX idx_sms_inbound_status ON public.sms_inbound (status);
CREATE INDEX idx_sms_inbound_from_phone ON public.sms_inbound (from_phone);

ALTER TABLE public.sms_inbound ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and FI can read sms_inbound"
  ON public.sms_inbound FOR SELECT
  USING (has_role(auth.uid(),'admin') OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins and FI can update sms_inbound"
  ON public.sms_inbound FOR UPDATE
  USING (has_role(auth.uid(),'admin') OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins can delete sms_inbound"
  ON public.sms_inbound FOR DELETE
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_sms_inbound_updated_at
  BEFORE UPDATE ON public.sms_inbound
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.service_template_slots
  ADD COLUMN IF NOT EXISTS songs text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.service_instance_slots
  ADD COLUMN IF NOT EXISTS songs text[] NOT NULL DEFAULT '{}'::text[];
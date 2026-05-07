ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS prospect_pipeline_stage text;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS priority text;
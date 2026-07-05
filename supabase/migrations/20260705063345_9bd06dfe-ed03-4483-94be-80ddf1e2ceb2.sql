ALTER TABLE public.service_template_slots ADD COLUMN IF NOT EXISTS is_song_slot boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_instance_slots ADD COLUMN IF NOT EXISTS is_song_slot boolean NOT NULL DEFAULT false;
-- Backfill: infer worship-like existing rows as song slots
UPDATE public.service_template_slots SET is_song_slot = true WHERE lower(title) LIKE '%worship%' OR lower(title) LIKE '%song%' OR array_length(songs,1) > 0;
UPDATE public.service_instance_slots SET is_song_slot = true WHERE lower(title) LIKE '%worship%' OR lower(title) LIKE '%song%' OR array_length(songs,1) > 0;
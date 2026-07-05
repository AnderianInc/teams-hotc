
ALTER TABLE public.service_instances
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

-- Bump parent service_instances.updated_at whenever a slot changes
CREATE OR REPLACE FUNCTION public.bump_service_instance_from_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance_id uuid;
BEGIN
  v_instance_id := COALESCE(NEW.instance_id, OLD.instance_id);
  IF v_instance_id IS NOT NULL THEN
    UPDATE public.service_instances SET updated_at = now() WHERE id = v_instance_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_instance_from_slot ON public.service_instance_slots;
CREATE TRIGGER trg_bump_instance_from_slot
AFTER INSERT OR UPDATE OR DELETE ON public.service_instance_slots
FOR EACH ROW EXECUTE FUNCTION public.bump_service_instance_from_slot();

-- Bump parent service_instances.updated_at whenever an assignment changes
CREATE OR REPLACE FUNCTION public.bump_service_instance_from_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_id uuid;
  v_instance_id uuid;
BEGIN
  v_slot_id := COALESCE(NEW.slot_id, OLD.slot_id);
  IF v_slot_id IS NOT NULL THEN
    SELECT instance_id INTO v_instance_id FROM public.service_instance_slots WHERE id = v_slot_id;
    IF v_instance_id IS NOT NULL THEN
      UPDATE public.service_instances SET updated_at = now() WHERE id = v_instance_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_instance_from_assignment ON public.service_slot_assignments;
CREATE TRIGGER trg_bump_instance_from_assignment
AFTER INSERT OR UPDATE OR DELETE ON public.service_slot_assignments
FOR EACH ROW EXECUTE FUNCTION public.bump_service_instance_from_assignment();

-- Backfill published_at for anything already published
UPDATE public.service_instances
SET published_at = updated_at
WHERE status = 'published' AND published_at IS NULL;

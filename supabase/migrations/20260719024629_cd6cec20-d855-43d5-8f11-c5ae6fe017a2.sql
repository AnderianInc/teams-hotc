CREATE UNIQUE INDEX IF NOT EXISTS check_ins_one_open_per_child_service
  ON public.check_ins (child_id, service_id)
  WHERE checked_out_at IS NULL;
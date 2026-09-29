ALTER TABLE public.pending_email_approvals ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.pending_sms_approvals ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;
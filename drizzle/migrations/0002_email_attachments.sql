-- Attachment metadata on email log and scheduled emails
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS attachments jsonb;
ALTER TABLE public.pending_email_approvals ADD COLUMN IF NOT EXISTS attachments jsonb;

-- Storage RLS for the private email-attachments bucket:
-- signed-in users upload/read under their own prefix (composer/<uid>/...);
-- the sender function uses the service role, which bypasses RLS.
CREATE POLICY "Users can upload own email attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'email-attachments' AND (storage.foldername(name))[1] = 'composer' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "Users can read own email attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'email-attachments' AND (storage.foldername(name))[1] = 'composer' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "Users can delete own email attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'email-attachments' AND (storage.foldername(name))[1] = 'composer' AND (storage.foldername(name))[2] = auth.uid()::text);
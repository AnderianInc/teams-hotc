# Add file attachments to email comms

## What you'll get
- An "Attach files" button in the email composer (Admin → Communications → Email) for both one-person and multiple-recipient sends.
- Attachments work for emails sent immediately **and** emails scheduled for later (they ride along through the Pending tab).
- Recipients receive the files as normal email attachments.

## How it works
1. **Attach in the composer** — pick one or more files (PDFs, images, Word docs, etc.). They upload to a private, secure storage area before sending. You'll see the file names with an option to remove any before sending.
2. **Send** — the email sender fetches the files from storage and attaches them to the outgoing email (the email service, Resend, supports attachments natively).
3. **Scheduled emails** — when you schedule an email, the attachment list is saved with it; the automatic dispatcher attaches the same files when it sends.

## Limits & safety
- Max 5 files per email, 10 MB total (typical email-provider safe size; larger files bounce).
- Blocked types: executables and scripts (.exe, .js, .zip, etc.).
- Storage is private — only signed-in admins/leads can upload, and files are only read server-side when sending.

## Technical details
- New private storage bucket `email-attachments` with RLS: authenticated upload/read own prefix; service role full access.
- `EmailComposer.tsx`: file input, upload to bucket at `composer`, chip list with remove; passes `attachments: [{path, name, type}]` to `send-email`; clears on send.
- `send-email` edge function: accepts `attachments`, downloads each from storage, base64-encodes into Resend's `attachments` payload; logs attachment names in `email_log` (new `attachments jsonb` column).
- `pending_email_approvals`: new `attachments jsonb` column; composer schedule flow saves it; `dispatch-scheduled-emails` passes it through to `send-email`.
- Multi-recipient sends reuse the same uploaded files for every recipient (no re-upload per person).

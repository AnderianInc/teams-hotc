# Birthday automation

A daily `pg_cron` job at 8 AM church time scans `attendees` and `profiles` for birthdays today and sends a templated greeting via Resend. The template lives in `email_templates` with slug `birthday-greeting`.

Admins can preview today's queue under **Admin → Birthdays** and fill missing dates of birth inline.

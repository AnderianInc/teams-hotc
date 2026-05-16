# External sources & sequences

Configure under **Admin → External Sources**.

## Sync controls
- Live status per source (last sync time, last error, records imported)
- **Sync now** button for on-demand pulls
- Cron pulls every 15 minutes

## Review queue
Records flagged `pending_review` (near-duplicates) wait here. Click **Confirm merge** to link to the matched attendee or **Ignore** to drop.

## Sequence editor
Each source has an ordered set of automated steps:
- **Prayer**: alert FI → SMS ack → Day-3 check-in → Day-7 invite
- **Visit**: email ack to requester + FI alert → SMS pickup confirm
- **Interest**: SMS+email ack → reminders at E-7, E-2, E-1 (email+SMS), E-day (email+SMS)

Edit `offset_days` or toggle `active` per step. The hourly dispatcher only sends each step once per record.

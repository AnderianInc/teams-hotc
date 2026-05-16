# External sources

Prayer requests, visit requests, and interest meeting sign-ups from the public-facing site are pulled into this app every 15 minutes (admins can also press **Sync now** under **Admin → External Sources**).

## What happens to each record
1. We try to match by email or phone against existing attendees.
2. Exact match → linked, marked **merged**, source tag added.
3. Near match (same last name + phone last-4) → status **pending_review** for FI to confirm.
4. No match → a new attendee is created with the source tag.

## What you see in the FI dashboard
The **Incoming** panel at the top of the dashboard lists everything received in the last 14 days, grouped by source. Pipeline cards display the source as a badge so you know which automated sequence is running.

## Source tags
- `source:prayer-request`
- `source:visit-request`
- `source:interest-meeting`

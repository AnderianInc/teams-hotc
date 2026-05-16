
## Goal
1. Read three external data sources (prayer requests, visit requests, interest meetings) from the read-only API and merge them into this app's `attendees` + `follow_ups` outreach pipeline with source-specific automated sequences that converge on Visited → Connected → Member.
2. Add an in-app Docs & Help center so admins, staff, team leads, and members can learn the system without external training.

---

## Part A — Outreach integration

### 1. External API sync
New edge function `outreach-sync` (admin-only + scheduled):
- Stores secret `OUTREACH_API_KEY` (you'll provide after approval).
- On each run, hits `/prayer-requests`, `/visit-requests`, `/interest-meetings` with `?since=<last_sync>&limit=500`, paginating with `offset`.
- Tracks last-sync timestamp per endpoint in a new `external_sync_state` table.
- Manual "Sync now" button (admin) plus `pg_cron` every 15 min.

### 2. Data model
**`external_records`**: `source` (`prayer`|`visit`|`interest`), `external_id` (UUID upstream), `payload jsonb`, `status` (`pending_review`|`merged`|`created`|`ignored`), `attendee_id`, `received_at`, `processed_at`. Unique `(source, external_id)`.

**`external_sync_state`**: `source`, `last_synced_at`, `last_run_status`, `last_error`.

**`outreach_sequences`**: `source`, `step_order`, `offset_days`, `anchor` (`received`|`event_date`), `channel` (`email`|`sms`|`task`), `template_slug`, `audience` (`requester`|`fi_team`).

**`outreach_sequence_runs`**: tracks dispatched steps to prevent duplicates (`external_record_id`, `step_order`, `sent_at`).

### 3. Dedup logic
- Exact match on email or normalized phone → link, mark `merged`.
- Near match (same last name + phone last-4) → `pending_review` for FI to confirm.
- No match → create attendee with source tag, mark `created`.

### 4. Tag taxonomy
- `source:prayer-request`, `source:visit-request`, `source:interest-meeting`.
- `contacted` + `contacted:<YYYY-MM-DD>` auto-applied via DB trigger on `follow_up_activities` insert (works for existing first-timers too).

### 5. Source sequences (seeded; admin-editable)
All sequences end by ensuring an outreach `follow_ups` row exists so the existing pipeline picks them up.

**Prayer request** *(default — please confirm)*
- Day 0: alert email to FI/pastoral team, assign on-call pastor, SMS acknowledgement to requester (if opted-in).
- Day 3: SMS check-in.
- Day 7: invite to next prayer meeting (email).
- Day 10: enter pipeline at `interested`.

**Visit request**
- Day 0: email acknowledgement to requester, alert email to FI team, SMS to confirm pickup details.
- Add to pipeline at `interested`; once `first_visit_date` is set, existing first-timer trigger advances to `visited`.
- (Twilio delivery receipts: noted as future work.)

**Interest meeting** (anchored to `event_date`)
- Day 0: SMS + email acknowledgement.
- E-7, E-2, E-1, E-0: email reminders (plus SMS on E-1 and E-0).
- Post-event: enter pipeline at `visited`.

A new `outreach-dispatch` edge function runs hourly via cron, finds due steps, and sends via existing `send-email` / `send-sms` functions. SMS gated by `sms_opt_in`.

### 6. UI
**Admin Panel → "External Sources" tab**: connection status, last sync, "Sync now", sequence editor, pending-review duplicate queue (Merge / Create-new / Ignore).

**First Impressions dashboard → "Incoming" panel**: new external records (last 14 days) grouped by source with "Open follow-up" action; source badges on existing pipeline cards.

---

## Part B — In-app Docs & Help

### Structure
New route `/help` (also linked from sidebar footer and a `?` icon in the top bar). Markdown-driven, rendered with `react-markdown`. Content lives in `src/content/help/*.md` so non-devs can edit via the codebase view; an index in `src/content/help/index.ts` defines the navigation tree and required role for each article.

### Sections (initial articles)
**Getting started**
- Welcome & system overview
- Roles explained (Admin, Staff, Team Lead, Member)
- Signing in, profile setup, SMS opt-in

**First Impressions**
- Registering a visitor at the kiosk / QR welcome
- Outreach pipeline: stages and how cards advance
- External sources (prayer/visit/interest): what auto-syncs and what to review
- Logging a follow-up activity (and the auto "contacted" tag)

**Children's Ministry**
- Check-in / check-out flow, offline mode, printer pairing
- Registering a family, age/grade rooms

**Teams & Scheduling**
- Adding members, team types (Ministry / Volunteer / Staff)
- Building a roster, blocking dates, accepting/declining assignments
- Calendar view

**Communications**
- Sending email/SMS, using templates and the AI composer
- Birthday automation
- SMS opt-in rules

**Admin**
- Directory management, deletion requests, organogram
- Security & RLS overview (plain English)
- Configuring external sources & sequences

**Troubleshooting & FAQ**
- "I'm not receiving roster emails" → check spam, notification settings, profile email
- "External record didn't sync" → check Admin → External Sources → last-run status
- Common error messages

### Features of the help center
- Sidebar with section tree + sticky breadcrumbs.
- Client-side search across article titles + body (Fuse.js).
- Role-aware visibility (Admin-only articles hidden from members).
- Each article supports embedded screenshots (`src/content/help/images/`) and short looped GIFs where useful.
- "Was this helpful?" thumbs that write to a new `help_feedback` table (admin reads in Admin Panel → Feedback).
- Contextual "Learn more" links from key UI surfaces (pipeline header, scheduling screen, kiosk page) deep-link into the matching article.

### Public docs entry point
- Public `/help` works without auth for general articles flagged `public: true` (e.g. "What is HOTC Volunteer Hub", SMS policy summary). Role-gated articles redirect to login.

---

## Open items to confirm
1. Prayer-request sequence — confirm or amend the default above.
2. OK to auto-create attendees for unmatched external records, or require FI review first in all cases?
3. Any articles you want in the first cut beyond the list above?

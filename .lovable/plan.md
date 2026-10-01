# Unified Funnel: Plan a Visit + Interest Meetings (hourly sync)

One funnel table, two lead types. Visitors and interested volunteers stay out of the Church Directory until they actually attend; both get automated, consent-aware follow-ups.

## 1. Database changes

- Add `lead_type` (`'visit'` | `'interest'`, default `'visit'`) to `funnel_leads`.
- Add `preferred_team_ids` (uuid[]) to `funnel_leads` for interest leads.
- New table `interest_meeting_sessions` (id, session_date, start_time, location, notes, is_active) — admins create the fixed recurring dates; the public form lists upcoming sessions.
- Extend `promote_funnel_lead(lead_id)`:
  - `visit` leads: current behavior (match/create attendee, attendance record, tags `first-timer`, `planned-visit`).
  - `interest` leads: match/create attendee, then create a `volunteer_onboarding` row at stage `interested` with their `preferred_team_ids` and source `interest-meeting`.
- RLS + grants: admins and First Impressions manage sessions and leads; public insert only via edge functions.

## 2. Public Interest Meeting page (`/interest-meeting`)

- Mobile-friendly form mirroring `/plan-a-visit`: name, email, phone, SMS consent checkbox, dropdown of upcoming sessions (from `interest_meeting_sessions`), multi-select of teams of interest, optional questions.
- New `interest-meeting-submit` edge function: same protections as `plan-visit-submit` (validation, honeypot, rate limit), inserts `funnel_leads` with `lead_type = 'interest'` and queues the message sequence.
- Confirmation screen with session date/time/location.

## 3. Automated message sequences (both lead types)

Queued into `funnel_messages`, sent by the existing 15-min `dispatch-funnel-messages` cron; texts only with opt-in, everything logged.

- **Visit leads** (unchanged): immediate confirmation → Saturday reminder → Sunday-morning nudge → Monday no-show.
- **Interest leads**: immediate confirmation with session details → day-before reminder → day-of nudge (1 hour before) → next-day no-show "want to pick another session?" message.

## 4. Outreach sync rework (`outreach-sync`)

- Schedule: **hourly** (`0 * * * *`) — 24 runs/day instead of 96, cutting cost ~75%. Manual "Sync now" stays available.
- `GET /visit-requests` → `funnel_leads` with `lead_type = 'visit'`; `GET /interest-meetings` → `lead_type = 'interest'`. Prayer requests keep their existing alert flow.
- Copy `sms_consent`, `sms_consent_at`, `sms_consent_source` from the API payload onto the lead so the dispatcher can text them.
- Queue the matching automated sequence for each new lead (same messages as the public forms).
- Matched records (existing attendees) still merge with source tags as today.

## 5. Management UI

- **Planned Visits page** gets lead-type tabs: All / Sunday Visits / Interest Meetings.
  - Visit cards: family size, planned Sunday, campaign.
  - Interest cards: chosen teams, session date.
  - Actions per type: Mark Attended (runs the extended `promote_funnel_lead`), Mark No-show, Reschedule, Add note, Cancel.
- **Admin**: simple session manager to create/edit/deactivate interest meeting dates.
- `/join-team` keeps working; existing interested signups already in the directory are left untouched (per your decision). New interest signups go through the funnel.

## 6. Verification

- Submit a real test visit lead and interest lead; confirm messages queue and send.
- Run one manual outreach sync; confirm leads land with correct `lead_type` and consent.
- Mark each type attended; confirm directory entry (and volunteer pipeline row for interest) with no duplicates.

## Technical details

- Migration: `funnel_leads.lead_type` (text, default `'visit'`, backfill existing rows), `preferred_team_ids uuid[] default '{}'`, `interest_meeting_sessions` table with grants/RLS, updated `promote_funnel_lead` (security definer).
- New edge function `interest-meeting-submit`; edits to `outreach-sync` (lead_type mapping, consent copy, message queueing) and redeploy.
- Cron: `cron.schedule('outreach-sync-hourly', '0 * * * *', ...)` via net.http_post with explicit headers.
- UI: `src/pages/InterestMeeting.tsx`, session manager in Admin, tab/filter updates in `src/pages/PlannedVisits.tsx`, sidebar link.
- Timezone: America/Los_Angeles via `church_timezone` app setting.

## Open items

- Interest meeting location text for confirmations (e.g. "Conference room, after 2nd service").
- Real service time(s) and address for visit confirmations (still placeholders).

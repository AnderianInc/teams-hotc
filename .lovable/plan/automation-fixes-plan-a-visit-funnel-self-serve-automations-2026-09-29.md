# Automation Fixes + Plan a Visit Funnel + Self-Serve Automations & AI Assistant

Four workstreams. Phase 1 makes existing automations reliable; Phase 2 builds the Plan a Visit funnel; Phase 3 turns automations into something your team can build themselves; Phase 4 adds an AI helper for end users.

## Phase 1 — Fix the automated system

1. **Revive the 5-minute outreach dispatcher.** The scheduled job exits without doing anything. Point it straight at the dispatcher with proper headers; remove the duplicate hourly job.
2. **Welcome follow-up text reaches everyone.** Replace the narrow 22–26 hour window with a "sent" marker: anyone signed up 20+ hours ago without the text gets it. Run hourly during the day (Pacific).
3. **Birthday emails go through the main email sender.** Respects do-not-contact and unsubscribes, adds the unsubscribe link, logs to Email Log, checks birthdays in Pacific time.
4. **Text consent check works for everyone.** Replace the "first 50 contacts" lookup with a direct phone-number match in sending and the incoming-text inbox.
5. **Faster, safer outreach dispatcher.** Load runs and contacts in bulk; send admin alerts together.
6. **Scheduled texts/emails retry on hiccups.** Temporary errors retry up to 3 times before marking failed; consent rejections still fail immediately.
7. **Stop the broken outside sync from spamming errors.** Pause the 15-minute prayer/visit/interest sync until a working key is provided; unmatched people will go to the new leads list, never straight into the Church Directory.

## Phase 2 — Plan a Visit funnel

### What visitors see
- Public page at `teams.hotc.life/plan-a-visit` (Facebook/Instagram ad destination; `hotc.life/visit` can link to it).
- Simple mobile form: name, phone, email, which Sunday, adults/kids count, kids' ages (optional), questions, text-consent checkbox.
- Confirmation screen with service time, address, what to expect. Ad campaign details from the link captured automatically.

### Automatic follow-up (like Church Funnels)
- Immediately: confirmation text + email.
- Saturday before: reminder.
- Sunday morning: "see you soon" nudge with directions.
- No-show Monday: gentle "we missed you — pick another Sunday?" message.
- Texts only to consenting people; everything respects opt-outs and is logged.

### What the team sees — "Planned Visits" view (First Impressions + Admin)
- List by upcoming Sunday with status: Planned, Confirmed, Attended, No-show, Cancelled.
- Filters by Sunday, status, campaign; counts (leads, showed up, show-up rate per campaign).
- Actions: Mark Attended, Mark No-show, Reschedule, Add note.
- **Mark Attended** is the only path into the Church Directory (matches existing people by email/phone to avoid duplicates) and starts normal first-timer follow-up.

## Phase 3 — Self-serve automations (no more prebuilt-only)

Replace hardcoded follow-up rules with a visual **Automation Builder** (Admin + First Impressions):

- **Trigger → Steps** model. Triggers: "New planned visit", "First-time visitor attended", "Birthday", "New person added", "No-show after planned visit". Steps: send text / send email / wait X days / create follow-up task.
- Pick a template (or write your own), set the delay, reorder steps, toggle each automation on/off.
- Existing follow-ups (welcome text, coffee-with-PK, birthdays, planned-visit sequence) are migrated in as editable automations — same behavior, now visible and adjustable.
- Per-automation activity view: who received what, when, and what failed.

## Phase 4 — AI help assistant for end users

- A chat bubble on every page ("Ask for help") powered by the built-in AI.
- Answers questions about using the app, grounded in the existing help articles (check-in, rosters, order of service, comms, etc.), and can point users to the right page.
- Knows who is asking (their role/teams) so answers match what they can actually do.
- Falls back to "ask an admin" with a one-tap feedback message when unsure.
- One conversation per user, saved so it continues across visits.

## Technical details
- New tables: `funnel_leads` (contact, visit_date, party size, kids JSON, SMS consent, utm_* columns, status, attendee_id once promoted, notes), `funnel_messages` (lead_id, step, channel, scheduled_for, status, attempts, error), `automations` + `automation_steps` + `automation_runs`, `assistant_messages` (per-user conversation). RLS: admins + First Impressions for leads/automations; users read only their own assistant chat.
- `plan-visit-submit` edge function: validated, rate-limited, honeypot; public insert into `funnel_leads` only.
- `promote_funnel_lead(lead_id)` security-definer RPC: match/insert attendee, record attendance, set status.
- Automation engine: one consolidated cron (every 15 min) processes due automation steps, funnel messages, and scheduled texts/emails.
- AI assistant: edge function using the built-in AI gateway, system prompt built from `src/content/help/articles/*` + caller's role; full conversation history sent each turn; markdown-rendered replies.
- Phase 1: `welcome_sms_sent_at` on attendees; indexed normalized `phone_last10` on attendees/profiles; pg_cron jobs call functions via `net.http_post` with explicit headers; `outreach-sync` writes unmatched records to `funnel_leads`.
- Timezone: existing church setting (America/Los_Angeles).

## Open items
- Service time(s) and address for confirmations/reminders.
- A new outreach API key if the old prayer/visit/interest sync should resume.

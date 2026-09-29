# Automation Fixes + Plan-a-Visit Funnel

Two phases. Phase 1 makes the existing automations reliable so the new funnel builds on solid ground. Phase 2 builds the Church-Funnels-style Plan a Visit system, which stays separate from the Church Directory.

## Phase 1 — Fix the automated system

1. **Revive the 5-minute outreach dispatcher.** The scheduled job currently exits without doing anything. Point it straight at the outreach dispatcher with proper headers, then remove the duplicate hourly job so only one runs.
2. **Welcome follow-up text reaches everyone.** Replace the narrow 22–26 hour window with a "sent" marker: anyone who signed up 20+ hours ago and hasn't had the text yet gets it. Run it hourly during the day (Pacific time) so Sunday visitors get it on Monday.
3. **Birthday emails go through the main email sender.** Respects do-not-contact and unsubscribes, adds the unsubscribe link, logs to Email Log, and checks birthdays using the church's Pacific timezone.
4. **Text consent check works for everyone.** Replace the "first 50 contacts" lookup with a direct phone-number match, in both sending and the incoming-text inbox, so opted-in people past #50 stop being blocked.
5. **Faster, safer outreach dispatcher.** Load sequence runs and contacts in bulk instead of one-by-one; send admin alerts together instead of one after another.
6. **Scheduled texts/emails retry on hiccups.** A temporary error retries up to 3 times (with a delay) before marking the message failed; consent/opt-out rejections still fail immediately.
7. **Stop the broken outside sync from spamming errors.** Pause the 15-minute prayer/visit/interest sync until a working key is provided, and stop it from ever adding unmatched people into the Church Directory (they'll go into the new leads list instead).

## Phase 2 — Plan a Visit funnel

### What visitors see
- Public page at `teams.hotc.life/plan-a-visit` (ad destination for Facebook/Instagram; `hotc.life/visit` can link to it).
- Simple mobile form: name, phone, email, which Sunday, number of adults/kids, kids' ages (optional), any questions, and a text consent checkbox.
- Confirmation screen with service time, address, and what to expect.
- Ad campaign details from the link (source, campaign, ad) are captured automatically.

### Automatic follow-up (like Church Funnels)
- Immediately: confirmation text + email.
- Saturday before: reminder.
- Sunday morning: "see you soon" nudge with directions.
- If they don't show: a gentle "we missed you, want to pick another Sunday?" message on Monday.
- Texts only go to people who ticked consent; everything respects opt-outs and is logged in the comms history.
- Admins can edit the wording of each message and turn steps on/off.

### What the team sees — new "Planned Visits" view (First Impressions + Admin)
- List by upcoming Sunday with status: Planned, Confirmed, Attended, No-show, Cancelled.
- Filters by Sunday, status, and ad campaign; simple counts (leads, showed up, show-up rate per campaign).
- Actions: Mark Attended, Mark No-show, Reschedule, Add note.
- **Mark Attended** is the only thing that adds them to the Church Directory (matching existing people by email/phone to avoid duplicates) and moves them into the normal first-timer follow-up.

### Later (not in this build)
- Direct Facebook Lead Ads connection (lead forms inside Facebook) — can plug into the same leads list later.

## Technical details
- New table `funnel_leads` (contact, visit_date, party size, kids JSON, sms consent fields, utm_* columns, status, attendee_id once promoted, notes) + `funnel_messages` (lead_id, step, channel, scheduled_for, status, attempts, error). RLS: admins + First Impressions members; public inserts only via a validated edge function (`plan-visit-submit`, rate-limited, honeypot).
- Message steps stored in `app_settings` (`funnel_config`) with templates in `email_templates`/`sms_templates`.
- One consolidated cron (every 15 min) dispatching due `funnel_messages`, scheduled texts and scheduled emails, replacing separate pollers where possible.
- `promote_funnel_lead(lead_id)` security-definer RPC: match/insert attendee, record attendance, set status.
- Phase 1: `welcome_sms_sent_at` column on attendees; indexed normalized `phone_last10` on attendees/profiles; rewrite pg_cron jobs to call functions via `net.http_post` with headers; `outreach-sync` writes unmatched records to `funnel_leads` instead of `attendees`.
- Timezone: use existing `src/lib/timezone.ts` church setting (America/Los_Angeles).

## Open items
- Service time(s) and address to show on the confirmation/reminders.
- A new outreach API key if the old prayer/visit/interest sync should resume.

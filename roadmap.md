# Roadmap

## Phase 1 — Automation fixes
- [x] Fix outreach-dispatch cron (headers via net.http_post, remove duplicate hourly job)
- [x] Welcome follow-up SMS: sent-marker instead of 22–26h window, hourly Pacific
- [x] Birthday emails via send-email (DNC, unsubscribe, logging, Pacific timezone)
- [x] SMS consent: indexed phone match instead of .limit(50) in-memory
- [x] outreach-dispatch: bulk loads, batched admin alerts
- [x] Scheduled SMS/email dispatchers: retry transient errors (3 attempts)
- [x] Pause broken outreach-sync cron
- [x] outreach-sync: unmatched records -> funnel_leads

## Phase 2 — Plan a Visit funnel
- [x] funnel_leads + funnel_messages tables, RLS, grants
- [x] plan-visit-submit edge function (validated, honeypot, rate limit)
- [x] /plan-a-visit public page (form, UTM capture, confirmation)
- [x] Planned Visits management view (FI + Admin), Mark Attended -> promote_funnel_lead RPC
- [ ] Follow-up sequence: confirmation, Sat reminder, Sun nudge, Mon no-show

## Phase 3 — Self-serve automations
- [ ] automations / automation_steps / automation_runs tables
- [ ] Automation Builder UI (trigger -> steps, templates, delays, on/off)
- [ ] Migrate existing follow-ups into editable automations
- [ ] Consolidated 15-min automation engine cron

## Phase 4 — AI help assistant
- [ ] assistant_messages table (per-user conversation)
- [ ] ai-assistant edge function (help articles + role context, markdown)
- [ ] Chat bubble UI on every page

## Blocked / deferred
- outreach-sync resume: needs fresh OUTREACH_API_KEY from external service
- Open item: service time(s) + address for confirmations
- Social media posting feature (deferred)

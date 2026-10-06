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
- [x] Follow-up sequence: confirmation, Sat reminder, Sun nudge, Mon no-show

## Phase 2b — Unified funnel (visits + interest meetings)
- [x] lead_type ('visit'|'interest') + preferred_team_ids on funnel_leads
- [x] interest_meeting_sessions table + admin session manager (Settings > Interest Meetings)
- [x] /interest-meeting public page + interest-meeting-submit edge function
- [x] promote_funnel_lead: interest leads -> volunteer_onboarding (stage: interested)
- [x] Planned Visits page: All / Sunday Visits / Interest Meetings tabs, team badges
- [x] outreach-sync: lead_type mapping, sms_consent copy, message queueing
- [x] outreach-sync cron: hourly (0 * * * *) instead of 15-min

## Phase 3 — Events app (replaces Planned Outreach)
- [ ] Data: events, event_workflow_steps, source mappings, lead tags, template categories
- [ ] Seed Interest Meeting event + 6 editable templates; link existing leads
- [ ] event-register endpoint + template-rendering dispatcher
- [ ] Events app UI: list, manual setup, workflow builder, event dashboard
- [ ] Public /e/:slug + /interest-meeting on dynamic page; remove /plan-a-visit
- [ ] Registrant tags usable in composers / contact groups (leads not in directory)
- [ ] AI setup wizard
- [ ] Retire Planned Outreach + old submit functions; end-to-end test

## Phase 4 — AI help assistant
- [ ] assistant_messages table (per-user conversation)
- [ ] ai-assistant edge function (help articles + role context, markdown)
- [ ] Chat bubble UI on every page

## Blocked / deferred
- Open item: service time(s) + address for confirmations (placeholders in use)
- Open item: interest meeting default location text
- Social media posting feature (deferred)

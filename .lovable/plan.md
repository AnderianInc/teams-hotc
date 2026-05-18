## Goal

Three things, bundled into one rollout:

1. **Filters** on the three large-data screens you picked (Church Directory, Planned Outreach, First Impressions lists), using a shared chips + popover pattern. No persistence. No CSV export.
2. **Standardized phone numbers** across the app so they're stored and displayed in the same format and never fail Twilio's E.164 requirement.
3. **Unified communications timeline + duplicate guard** so anyone reviewing a contact can see every email and SMS they've received and we don't accidentally re-send the same thing.

---

## Part 1 — Filters

### Shared filter kit (new)

- `src/components/filters/FilterChips.tsx` — pill toggles with an "All" reset.
- `src/components/filters/FilterPopover.tsx` — single "Filters" button with a badge count, multi-select sections, optional date range, "Clear all".
- `src/components/filters/ActiveFilterBar.tsx` — removable tags below the search row + result counter ("Showing 84 of 612").
- `src/hooks/useTableFilters.ts` — `search`, `chips`, `facets`, `dateRange`, helpers, and a memoized `filter(rows, predicates)`.

All filtering is client-side over already-fetched rows. No edge function or RLS changes.

### Church Directory (`ChurchDirectory.tsx`)
- **Chips:** Type — All · Members · Visitors · Volunteers.
- **Popover:** Team, Role on team, Has email, Has phone, SMS opt-in, Birthday month, Tags, Family (With/Solo).

### Planned Outreach (`PlannedOutreachPanel.tsx`)
- **Search:** recipient name, email/phone, subject, body preview.
- **Chips:** Source (Prayer/Visit/Interest), Channel (Email/SMS).
- **Popover:** Step, Audience, Requires review, Scheduled window (Today / 7d / 30d / Custom).
- Tab counters show "12 of 84" when filtered.

### First Impressions
**Attendees:** chips for Status, popover for Source, Has email, Has phone, SMS opt-in, Tags, First-visit window.
**Follow-ups:** chips for Status + Priority, popover for Pipeline stage, Method, Due window, Assignee, Tags.

### Behavior
- Facet options derived from loaded rows. Empty state: "No matches — Clear filters". Resets on reload.

---

## Part 2 — Standardized phone numbers

### Problem
Phones are entered in many shapes (`(415) 555 1212`, `415-555-1212`, `+1 415 555 1212`, `4155551212`). The display looks inconsistent everywhere, and bad rows can fail Twilio's required E.164 format.

### Approach
Normalize **on write**, store **canonical E.164** (`+15558675310`), render with a friendly mask. Backfill what's already there.

**Library:** `libphonenumber-js` (~80 KB). Default country `US` (configurable via `app_settings`).

### New files
- `src/lib/phone.ts` — `normalizePhone(input)`, `formatPhoneDisplay(e164)`, `isLikelyMobile(e164)`.
- `src/components/ui/phone-input.tsx` — live-formats as user types, stores canonical E.164 on blur, shows inline validation error.
- `supabase/functions/_shared/phone.ts` — same logic for Deno so server and client agree.

### Replace raw phone `<Input>` with `PhoneInput` in
`Welcome.tsx`, `CompleteProfile.tsx`, `AttendeeList.tsx`, `DirectoryEditDialog.tsx`, `EditVolunteerDialog.tsx`, `RegisterChild.tsx`, `EditFamily.tsx`, plus any others surfaced before implementation.

### Display
Replace bare `{x.phone}` with `formatPhoneDisplay(x.phone)` in directory tables, attendee cards, follow-up list, review dialogs.

### Bulk import
`BulkImport.tsx` runs each row's phone through `normalizePhone` before insert; unparseable rows surface in the existing error summary.

### Backfill
- Migration: `ALTER TABLE attendees ADD COLUMN phone_raw text;` and same on `profiles` (preserves original).
- New `phone_normalization_issues` table (id, source_table, row_id, original, reason, created_at), admin-only RLS.
- New `supabase/functions/normalize-phones` edge function — pages through both tables, copies original into `phone_raw` (only when null), writes canonical E.164 to `phone`, logs unparseables to the issues table. Invoked once by admin via a "Run phone cleanup" button on the SMS Opt-in tab. Safe to re-run.

### Twilio safety
- `send-sms` uses the shared helper; rejects with a clear error if the resolved `To` isn't valid E.164.
- `outreach-dispatch` marks rows with invalid phone as `skipped` with reason `invalid phone`, visible in the existing Skipped tab.

---

## Part 3 — Unified communications timeline + duplicate guard

### Problem
We send emails (and now SMS) from many surfaces — admin composer, automated outreach sequences, birthday cron, follow-up activities, register-visitor confirmation. Each writes to its own log. A team member has no single place to see "what has this person received from us?" and we can accidentally send the same template twice.

### Approach

**A. One unified contact-comms view, fed by existing tables.**

No new write paths. Instead, a normalized read-side view in the UI that pulls from:
- `email_log` (filter `related_attendee_id` OR `to_email` match)
- `sms_log` (filter `related_attendee_id` OR `to_phone` match)
- `outreach_sequence_runs` (joined to `external_records.attendee_id`)
- `follow_up_activities` where `activity_type ∈ ('email','sms','call','in_person','visit')` for the attendee's follow-ups

A new helper `src/lib/commsTimeline.ts` runs the four queries in parallel and merges them into a single sorted list with shape:
```text
{ id, ts, channel, direction, subject, preview, source, sentBy, status, refType, refId }
```

**B. New `CommsTimeline` component** (`src/components/comms/CommsTimeline.tsx`)
- Vertical timeline, newest first, grouped by month.
- Each item shows channel icon (mail/sms/phone), source pill (Manual / Sequence / Birthday / Follow-up / Visitor confirm), subject/preview, "Sent by" + relative time.
- Click expands to show full body (reuses the email viewer style from `EmailLog.tsx`).
- Filters: channel, source, date range (uses the shared filter kit from Part 1).

**C. Surface it on**
- **`DirectoryEntryDetail.tsx`** — new "Communications" tab next to the existing tabs.
- **First Impressions attendee drawer** — new "Comms" tab.
- **`PlannedOutreachPanel.tsx` review dialog** — shows the recipient's last 5 comms above the message editor (so the reviewer can see "we already sent this person the same Visit follow-up yesterday").

**D. Duplicate guard (cross-channel, pre-send).**

A shared helper `wasRecentlyContacted({ attendeeId, channel, templateSlug?, subject?, withinDays })` returns the matching prior send if any. It checks:
- `email_log` for same `to_email` + same `subject` within window, OR
- `outreach_sequence_runs` for same `external_record.attendee_id` + same `sequence_id` ever (sequences should never re-run), OR
- `sms_log` for same `to_phone` + same first 60 chars of body within window.

Wired into:
- **`outreach-dispatch`** — before sending, if `wasRecentlyContacted(..., withinDays: 14)` returns a hit for the same sequence step or the same subject, the row is marked `skipped` with reason `duplicate (sent <date>)` instead of sending. Visible in the existing Skipped tab.
- **`EmailComposer` / `SmsComposer`** — when the user picks a recipient, if there's a hit in the last 7 days, show an inline warning banner: "We sent **[subject]** to this contact on **May 15**. Send anyway?". Non-blocking; just a confirm step.
- **Outreach review dialog** — same warning banner when the prior send overlaps the queued message.

**E. Per-contact "Do not contact" flag (lightweight)**

New boolean `do_not_contact` + `do_not_contact_reason text` on `attendees` and `profiles`. When set:
- `send-email`, `send-sms`, `outreach-dispatch` all hard-block with status `suppressed` + reason `do_not_contact`.
- Directory edit dialog gets a toggle, mirroring the SMS opt-in pattern.

No new external services. All checks are SQL queries against existing tables plus the two new columns.

---

## Files

**New**
- `src/components/filters/{FilterChips,FilterPopover,ActiveFilterBar}.tsx`
- `src/hooks/useTableFilters.ts`
- `src/lib/phone.ts`
- `src/components/ui/phone-input.tsx`
- `src/lib/commsTimeline.ts`
- `src/components/comms/CommsTimeline.tsx`
- `src/lib/duplicateGuard.ts`
- `supabase/functions/_shared/phone.ts`
- `supabase/functions/_shared/duplicateGuard.ts`
- `supabase/functions/normalize-phones/index.ts`

**Edited**
- `ChurchDirectory.tsx`, `PlannedOutreachPanel.tsx`, `AttendeeList.tsx`, `FollowUpList.tsx`
- `DirectoryEditDialog.tsx`, `EditVolunteerDialog.tsx`, `BulkImport.tsx`, `SmsOptInManager.tsx`
- `RegisterChild.tsx`, `EditFamily.tsx`, `Welcome.tsx`, `CompleteProfile.tsx`
- `DirectoryEntryDetail.tsx` (add Communications tab)
- `EmailComposer.tsx`, `SmsComposer.tsx` (duplicate warning)
- `supabase/functions/send-email/index.ts`, `send-sms/index.ts`, `outreach-dispatch/index.ts` (DNC + duplicate guard + shared phone helper)

**Migrations**
- `attendees`, `profiles`: add `phone_raw text`, `do_not_contact boolean default false`, `do_not_contact_reason text`.
- New `phone_normalization_issues` table, admin-only RLS.

---

## Out of scope
- Saved/named filter views, URL-encoded filters, CSV export.
- Email Log / SMS Log / Weekly Attendance / Roster filters.
- Inbound email/SMS replies (we only log what we send).
- International phone collection beyond US default + manual country picker.
- A standalone "all comms" admin report — the timeline lives on each contact's page; admins can still use Email Log / SMS Log tabs for the cross-contact view.

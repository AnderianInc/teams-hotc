## Problem

When a contact or external record is added close to (or after) an event date, the outreach dispatcher still fires reminder steps whose scheduled date is in the past. Example: an "interest" record added 2 days before the event triggers the "1 week before" reminder immediately, because the dispatcher only checks `Date.now() >= dueAt` — it has no concept of "this step's window has already closed."

The same issue applies to any received-anchored step (e.g. Day-3 check-in) when a record is backdated or imported late.

## Fix

In `supabase/functions/outreach-dispatch/index.ts`, add a "stale step" guard in Pass 1 (and apply the same logic when an approval-required step is queued so we don't pile up obsolete approvals either).

For each sequence step being evaluated against a record:

1. Compute `scheduled_for` as today (already done).
2. Compute `staleCutoff` = `scheduled_for + GRACE_DAYS`.
3. If `now > staleCutoff`, do not send and do not queue for approval. Instead, insert an `outreach_sequence_runs` row with `status = 'skipped'` and `detail = 'stale: scheduled date already passed'` so it won't be re-evaluated next hour and is auditable in the UI.

Grace window:
- `received`-anchored steps: **1 day** grace (a Day-3 check-in added on Day-4 is still useful; on Day-10 it isn't).
- `event_date`-anchored steps: **0 days** grace for pre-event reminders (offset_days < 0), **1 day** grace for day-of/post-event steps (offset_days >= 0).

This keeps the existing behavior intact for records added on time, prevents stale reminders from blasting out when records are added late, and leaves a clear skip record in the runs table.

No DB schema changes. No UI changes. Single-file edit to the edge function.

## Technical details

File: `supabase/functions/outreach-dispatch/index.ts`

- Add helper `isStale(scheduledForIso, anchorKind, offsetDays): boolean`.
- In the per-step loop (around line 165), after computing `scheduled_for`/`dueAt` and before the `Date.now() < dueAt` early-continue, check `isStale(...)`. If stale, insert a skipped run with detail `"stale: scheduled date already passed"` and `continue`.
- Apply the same stale check before the `requires_approval` queue insert so we don't queue approvals that are already expired.
- Pass 2 (already-approved rows whose `scheduled_for` arrived) is unchanged — those were intentionally approved earlier and should still send.

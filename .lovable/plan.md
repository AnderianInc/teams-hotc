## Problem

The new stale-step guard only fires when a sequence step is **first** evaluated for a record. Steps that were already queued as `pending_approval` (waiting for a reviewer to approve/reject) are not re-checked. So the Pending Approvals queue keeps showing obsolete items like "1 week before reminder" for events that already happened.

## Fix

In `supabase/functions/outreach-dispatch/index.ts`, add a **Pass 0** (runs before Pass 1) that sweeps `outreach_sequence_runs` rows with `status = 'pending_approval'` and marks any whose `scheduled_for` is past the same grace window as stale.

Steps:

1. Query all `outreach_sequence_runs` joined with their `outreach_sequences` parent where `status = 'pending_approval'`.
2. For each row, compute `staleCutoff = scheduled_for + graceDays * 86400000` using the same rule already in Pass 1:
   - `event_date` anchor + `offset_days < 0` → 0 days grace
   - `event_date` anchor + `offset_days >= 0` → 1 day grace
   - `received` anchor → 1 day grace
3. If `Date.now() > staleCutoff`, update the run to `status = 'skipped'`, `detail = 'stale: scheduled date passed before approval'`, and increment a `expired` counter returned in the response.
4. Leave Pass 1 and Pass 2 unchanged.

This auto-cleans the approval queue every hour with no UI changes and no schema changes. Already-approved-but-future rows (Pass 2 territory) are untouched — those are intentional.

## Technical details

File: `supabase/functions/outreach-dispatch/index.ts`

- Add a helper `isStale(scheduledForIso, anchorKind, offsetDays)` (or inline the same math already used in Pass 1) so the grace-window logic lives in one place.
- Insert a "Pass 0: expire stale pending approvals" block right after the sequences/records are loaded and before Pass 1 begins. Use a single `select` that pulls `id, scheduled_for, sequences:outreach_sequences(anchor, offset_days)` filtered by `status.eq('pending_approval')`.
- Iterate, compute stale, and `update` each stale row by id. (Volume is small — single-row updates keep the audit trail per row.)
- Return `{ ok, queued, dispatched, skipped, expired }` so the cron run logs show how many were cleaned.

No DB migration. No frontend changes — `PendingEmailsPanel` and the FI approvals UI already filter by `status = 'pending_approval'`, so expired rows disappear from those views automatically.

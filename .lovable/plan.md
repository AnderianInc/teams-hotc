## Two real bugs

### A. Approved-scheduled rows are invisible in the UI

`src/components/admin/PlannedOutreachPanel.tsx` Upcoming tab:

- The count is `upcoming.length + approvedScheduled.length` (line 540).
- The green banner says "180 approved messages are scheduled…" (line 683).
- But the table only iterates `list = upcoming` (line 672/699). `approvedScheduled` rows are never rendered.

That's why you see the count but can't find the rows.

### B. The dispatcher silently fakes successful sends

`supabase/functions/outreach-dispatch/index.ts` → `sendRun()`:

```ts
await supabase.functions.invoke("send-email", { body: { ... } });
```

It never inspects the response. `invoke()` only throws on transport errors, so a 400/403 from `send-email` (e.g. `DO_NOT_CONTACT`, Resend rate-limit, missing field) returns normally and the run is marked `sent`. It also never passes `logged_by`, so `send-email` skips writing to `email_log`.

Evidence: 56 outreach runs flipped to `sent` on 2026-05-29, but `email_log` has 0 entries for that day. The dispatcher is lying.

Same pattern in `supabase/functions/outreach-approve/index.ts` immediate-send branch.

## Fix

### 1. UI — render the missing rows

`src/components/admin/PlannedOutreachPanel.tsx`:

- In the Upcoming tab, render `approvedScheduled` runs as their own grouped section above the existing `upcoming` table (or interleave them). Columns: Source, Recipient, Subject, Scheduled send, Status badge ("approved · scheduled"). Reuse `renderPlannedRow` via a `runs`-based variant, or render inline using the existing run-row markup from the Pending tab.
- Clicking a row opens the same review drawer (`setReviewRunId(r.id)`).
- Keep the green banner, but only show it when at least one approved row is actually rendered.
- Add an "Unschedule" / "Send now" / "Skip" action menu in the run review drawer for `approved` status rows so admins can manage stale items.

### 2. Edge functions — actually check send results

`supabase/functions/outreach-dispatch/index.ts`:

- Rewrite `sendRun()` to check `error` and `data?.error` on the invoke response and throw with the upstream message; set `status='failed'` with the real `detail` (truncated to 500 chars).
- Pass `logged_by: rec.approved_by ?? null` (or a designated system user UUID from `app_settings.system_actor_id` if present) so every dispatcher send writes an `email_log` row.
- Pass 2 SELECT: add `.is("sent_at", null)` to skip rows already sent in a prior run.

`supabase/functions/outreach-approve/index.ts`:

- Same response-checking fix in the immediate-send branch.
- Pass `logged_by: userId`.
- Allow `action="approve"` against `status="failed"` rows as a retry (resets `sent_at=null`, then re-runs the send or re-queues based on `mode`).

### 3. Retry button in the UI

`PlannedOutreachPanel.tsx` run review drawer (~line 860): when `activeRun.status === "failed"`, show a Retry button that calls `outreach-approve` with `{ action: "approve", mode: "now" }`. Show `activeRun.detail` under the status badge so failures are diagnosable.

### 4. Cleanup migration for the 180 stale rows

These were all sent on 2026-05-17, then re-marked `approved` on 2026-05-27 with future `scheduled_for`. With fix #2 in place they'd resend on 2026-05-31. Mark them harmless:

```sql
UPDATE public.outreach_sequence_runs
SET status = 'skipped',
    detail = COALESCE(detail,'') || ' | auto-skip: already sent on ' || sent_at::date
WHERE status = 'approved' AND sent_at IS NOT NULL;
```

### 5. Verify after deploy

- `curl_edge_functions` invoke of `outreach-dispatch` returns a sane summary.
- `SELECT count(*) FROM outreach_sequence_runs WHERE status='approved' AND scheduled_for <= now()` = 0 after cleanup.
- After the next genuine send window: row counts for `status='sent' AND sent_at > now() - interval '1 hour'` in `outreach_sequence_runs` should match new `email_log.sent_at` rows in the same window.

## Files touched

- `supabase/functions/outreach-dispatch/index.ts`
- `supabase/functions/outreach-approve/index.ts`
- `src/components/admin/PlannedOutreachPanel.tsx` (render approved-scheduled, retry button, failure detail)
- New migration to skip the 180 stale rows

No schema changes.
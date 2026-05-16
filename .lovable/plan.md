## Remaining work to finish the outreach + help rollout

The backend, edge functions, cron, admin tab, FI incoming panel, and 19 help articles are already in place. Three small UI hookups and one verification step remain.

### 1. Help discoverability
- **`src/components/layout/AppSidebar.tsx`** — add a "Help" link (HelpCircle icon) in the sidebar footer, routing to `/help`. Visible to all authenticated users.
- **`src/components/layout/AppLayout.tsx`** (top bar) — add a `?` icon button next to the notification bell that links to `/help`. Tooltip: "Help & docs".

### 2. Source badges on pipeline cards
- **`src/components/first-impressions/OutreachPipeline.tsx`** — for each attendee card, scan `attendee.tags` for `source:prayer-request` / `source:visit-request` / `source:interest-meeting` and render a small colored `Badge` (Prayer = violet, Visit = blue, Interest = amber) so FI can see at a glance which automated sequence is driving the contact.

### 3. Verify the live sync
Once the user confirms `OUTREACH_API_KEY` is the production value:
- Call `outreach-sync` once via the admin "Sync now" button (or `curl_edge_functions`).
- Check `external_sync_state` for `last_run_status = 'ok'` per source and confirm rows appear in `external_records` and on the FI **Incoming** panel.
- Tail `outreach-sync` logs for any 401/403/parse errors and adjust field mapping if the live payload shape differs from what we assumed (`r.name`, `r.email`, `r.phone`, `r.event_date`).

### Out of scope for this pass
- Editing automated sequence copy (templates already seeded; user can tweak in Admin → External Sources → Sequence editor).
- Adding a public `/help` route gate — currently `/help` is behind auth; we can expose `public:true` articles unauthenticated in a follow-up if desired.

No schema changes. No new dependencies.

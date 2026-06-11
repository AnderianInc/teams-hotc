## Rework: Interest Meetings → Join Team pipeline

Replace the "lead → interest meeting → funnel" model with a dedicated **/join-team** signup that assumes the person is already a known visitor, and a new **Volunteer Onboarding pipeline**: Interested → Training → Volunteer.

---

### 1. Public route: `/join-team`

New page `src/pages/JoinTeam.tsx` plus matching QR card.

Form fields:
- First name, last name (required)
- Email and/or phone (at least one)
- Optional team preference (multi-select from Ministry + Volunteer teams; not required)
- Optional note ("Why do you want to serve?")
- SMS opt-in checkbox (same consent copy as `/welcome`)

Behavior on submit:
1. Call new edge function `register-volunteer-interest` (verify_jwt = false, mirrors `register-visitor`).
2. Edge function searches `attendees` + `profiles` for a match (email exact → phone last-10 → first+last fuzzy).
3. **If match found** → reuse that attendee_id.
   **If no match** → silently create a new attendee (tag `source:join-team`, `first-timer` only if no visit history).
4. Insert a `volunteer_onboarding` row at stage `interested` (see §3).
5. Apply team-preference tags (`team-pref:<slug>`) on the attendee.
6. Send confirmation email/SMS via existing templates.
7. Notify staff via `notifications` (existing pattern from register-visitor).

Show success screen with "We'll be in touch about next steps".

QR display: add a `JoinTeamQRDialog` (mirrors `AttendanceQRDialog`) and a tab/card in First Impressions and Admin.

---

### 2. New pipeline: Interested → Training → Volunteer

Stages:
- **interested** — submitted /join-team or staff-added
- **training** — invited to / attending training
- **volunteer** — completed onboarding, added to a team

Kanban board mirrors the existing Outreach Pipeline UX (arrows back/forward, remove, source badges). Lives under a new admin section **Volunteer Onboarding** (sidebar item) and a tab on the Team management page so leads see their team's onboarding queue.

When a card moves to **volunteer**:
- Prompt staff to assign to a team via existing `TeamMembershipEditor`.
- Set `completed_at`; row stays for history.

---

### 3. Data model

**New table `volunteer_onboarding`**
- `attendee_id` (fk attendees, unique with active stage)
- `stage` enum: `interested | training | volunteer`
- `preferred_team_ids uuid[]` (optional)
- `assigned_to uuid` (staff owner)
- `notes text`
- `completed_at timestamptz`
- `source text` ('join-team' | 'manual' | 'imported-from-interest')
- standard `created_at`, `updated_at`
- RLS: Admin + Staff full; Team Lead read/update rows whose `preferred_team_ids` intersect a team they lead; Member none.
- GRANTs for authenticated + service_role.

**Removed**:
- `interest_meetings` table (drop).
- Existing `external_records` rows with `source = 'interest'` are migrated into `volunteer_onboarding` at stage `interested` (one-time migration, preserving `attendee_id`).
- `follow_ups.prospect_pipeline_stage` keeps the original **outreach** pipeline (visitor → member) untouched; the new pipeline is a separate table so the two never collide.

---

### 4. Code removals (per "remove entirely")

Delete:
- `src/components/admin/InterestMeetings.tsx`
- `src/components/admin/InterestMeetingAutomations.tsx`
- Any nav/admin-panel tab linking to them.
- Branches in `register-visitor`, `outreach-sync`, `outreach-dispatch`, `ExternalSourcesPanel`, `PlannedOutreachPanel`, `PendingEmailsPanel` that special-case `source = 'interest'` (replace UI references with Volunteer Onboarding where useful, otherwise drop).
- `interest-meeting` email/SMS templates kept only if reused for training invites; otherwise removed.

---

### 5. New / updated files

Created
- `src/pages/JoinTeam.tsx`
- `src/components/first-impressions/JoinTeamQRDialog.tsx` (or admin equivalent)
- `src/components/admin/VolunteerOnboardingPipeline.tsx` (kanban)
- `src/components/admin/VolunteerOnboardingList.tsx` (table for leads)
- `supabase/functions/register-volunteer-interest/index.ts`
- Migration: create table + RLS + data backfill + drop `interest_meetings`.

Edited
- `src/App.tsx` — add `/join-team` route.
- `src/components/layout/AppSidebar.tsx` — add "Volunteer Onboarding".
- `src/pages/AdminPanel.tsx` — replace Interest Meetings tab with Volunteer Onboarding.
- `src/components/first-impressions/FirstImpressionsDashboard.tsx` — add QR card for /join-team alongside /welcome QR.
- `register-visitor` edge function — remove interest-source branch.
- Help articles — replace `fi-*` interest-meeting copy with onboarding doc.

---

### 6. Out of scope

- Automating training scheduling / calendar invites (manual for now).
- Background-check or document collection workflow.
- Auto-creating `team_members` rows — staff still does the final assignment.

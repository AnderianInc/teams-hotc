# HOTC Volunteers — Project Tracker

> Last updated: 2026-04-26  
> Branch: `claude/review-missing-feature-avBNS`

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Current Feature Inventory](#2-current-feature-inventory)
3. [Known Gaps & Bugs](#3-known-gaps--bugs)
4. [Planned Feature: Enhanced Follow-Up System (Inreach & Outreach)](#4-planned-feature-enhanced-follow-up-system-inreach--outreach)
5. [Planned Feature: Push Notification System](#5-planned-feature-push-notification-system)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Database Changes Required](#7-database-changes-required)

---

## 1. Project Summary

**HOTC Volunteers** is a church volunteer management platform for House of the Cross. It covers three core areas:

| Area | Description |
|---|---|
| Kids Check-In | Offline-first kiosk with family search, room assignment, and thermal receipt printing |
| First Impressions | Visitor tracking, follow-up queue, and QR check-in |
| Admin Panel | Volunteer, team, roster, attendance, directory, communications, and feedback management |

**Stack:** React 18 + TypeScript · Vite · Tailwind CSS + shadcn/ui · TanStack Query · Supabase (PostgreSQL + Auth) · PWA (IndexedDB offline)

---

## 2. Current Feature Inventory

### Authentication & Access
- [x] Email/password login with Supabase Auth
- [x] Role-based access: `admin`, `team_lead`, `member`, `staff`
- [x] Protected routes with role guards
- [x] Password reset flow
- [x] Profile completion onboarding

### Volunteer & Team Management
- [x] Multi-team volunteer coordination
- [x] Team role types (customizable per team)
- [x] Volunteer invitations (Supabase Edge Function)
- [x] Resend invites, edit/delete volunteers
- [x] Multi-team membership editing

### Kids Check-In
- [x] Family/child search by name or parent phone
- [x] Child registration with family links
- [x] Room assignment by grade group
- [x] Offline-first with IndexedDB caching + auto-sync queue
- [x] Thermal receipt printing (Brother printer integration)
- [x] Medical notes and allergy tracking
- [x] Check-in confirmation flow

### Visitor & First Impressions
- [x] Attendee list (visitors and members)
- [x] Follow-up queue with status tracking (`pending → contacted → connected → closed / no_response`)
- [x] Attendee relationship tracking (family/connections)
- [x] QR code generation for contactless check-in
- [x] Email follow-up from the follow-up queue

### Admin Panel (8 sections)
- [x] Volunteers: invite, edit, delete, resend invites
- [x] Teams: create/edit teams, assign volunteers
- [x] Roster/Calendar: event creation, recurring events, volunteer assignment
- [x] Attendance: weekly tracking and analytics
- [x] Directory: full church directory with family management
- [x] Communications: email templates, AI-powered drafting, email log
- [x] Feedback: submission, admin review and response
- [x] Requests: GDPR-style account deletion management

### Infrastructure
- [x] PWA with service worker and offline caching
- [x] Row-level security (RLS) on all Supabase tables
- [x] React Query server-state caching with invalidation
- [x] Supabase Edge Functions (invite, send-email)

---

## 3. Known Gaps & Bugs

### Bug: Roster Calendar RLS (Team Leads)

**Severity:** High — team leads cannot create or delete roster events.

**Root cause:** Roster events are now top-level entities (`team_id = NULL`) with teams linked via `roster_event_teams` junction table. Existing RLS policies on `roster_events` for team leads still require `team_id IS NOT NULL`, so all insert/update/delete operations silently fail for non-admins.

**Fix required:**
- Add `is_any_team_lead(user_id uuid)` helper function to check if a user leads ANY team
- Update INSERT / UPDATE / DELETE policies on `roster_events` to allow team leads when `team_id IS NULL`
- Files: new Supabase migration + `src/components/admin/RosterCalendarView.tsx` (better error toasts) + `src/components/teams/RosterEventManager.tsx`

---

### Gap: No Data Export / Reporting

**Impact:** Admins cannot export volunteer lists, attendance reports, family data, or follow-up summaries to CSV/Excel for external use (e.g., board reports, pastoral reviews).

**Scope:** Admin panel — Volunteers, Attendance, Directory, and Follow-Up sections.

---

### Gap: No Bulk Import

**Impact:** Onboarding a large congregation requires manual entry one-by-one. No CSV import for volunteers, families, or attendees.

---

### Gap: No Kids Check-Out Flow

**Impact:** The system records who checked in but has no way to record pickup/checkout, so there is no way to confirm a child was released to the correct guardian.

---

### Gap: No Volunteer Availability / Scheduling Preferences

**Impact:** Roster assignments are manual with no awareness of a volunteer's availability windows or scheduling preferences. Team leads have no visibility into who is available for a given date.

---

### Gap: Email Template Placeholder Substitution

**Impact:** Email templates define placeholder arrays but the substitution of real values (e.g., `{{first_name}}`) is not wired up in the send flow.

---

### Gap: No Analytics Export / Dashboard Charts

**Impact:** `WeeklyAttendance` collects data but there are no trend charts, period comparisons, or downloadable attendance reports.

---

### Gap: No Push Notifications

**Impact:** All communication is pull-based (users must open the app). There is no mechanism to alert team leads about new follow-ups, remind volunteers of upcoming assignments, or notify admins of new requests. Covered in detail in [Section 5](#5-planned-feature-push-notification-system).

---

### Gap: Inreach & Outreach Follow-Up System

**Impact:** The existing follow-up queue (under First Impressions) is designed only for visitor outreach and lacks the ability to track member engagement, volunteer participation health, and the full inreach lifecycle. Covered in detail in [Section 4](#4-planned-feature-enhanced-follow-up-system-inreach--outreach).

---

## 4. Planned Feature: Enhanced Follow-Up System (Inreach & Outreach)

### 4.1 Problem Statement

The current `follow_ups` table and `FollowUpList` component were built exclusively for the First Impressions / visitor outreach use case. There is no system to:

- Proactively track the engagement health of existing members
- Identify volunteers who are becoming inactive or disengaged
- Automate the outreach lifecycle for first-time attendees (beyond manual queue entry)
- Distinguish between a pastoral inreach task vs. an evangelistic outreach task
- Assign follow-ups to specific team members with accountability and reminders

### 4.2 Inreach — Member Engagement Tracking

**Goal:** Ensure every member is known, cared for, and connected.

#### Engagement Scoring
- Compute a per-member engagement score based on:
  - Attendance frequency (weekly_attendance records)
  - Volunteer shift participation (roster_entries)
  - Last seen / last contacted date
  - Response to past follow-ups
- Score bands: `Active`, `Drifting` (missed 2–4 weeks), `At Risk` (5–8 weeks), `Inactive` (9+ weeks)

#### Automatic Inreach Triggers
- When a member's attendance drops below their baseline → auto-create an inreach follow-up task and assign to their team lead or a designated pastoral care person
- When a volunteer has had zero roster assignments in 30 days → flag for team lead review
- When a volunteer declines multiple event assignments → flag for conversation

#### Inreach Follow-Up Lifecycle
```
identified → assigned → contacted → conversation_held → resolved / ongoing
```

#### Inreach Dashboard (new admin section)
- Table of all members sorted by engagement score (lowest first)
- Filters: score band, team, last contact date, assigned-to
- Quick-assign follow-up from the table row
- Engagement trend chart per member
- Team-level engagement health summary (% active per team)

### 4.3 Outreach — Visitor & Pre-Attendee Tracking

**Goal:** No first-time visitor falls through the cracks; every pre-attendee is warmly pursued.

#### First-Time Attendee Automation
- When an attendee is logged with `first_visit_date = today` and `is_member = false` → automatically create an outreach follow-up task (assigned to the First Impressions team lead or a configurable default assignee)
- Send a welcome email within 24 hours using an email template (today this is manual)
- Schedule a text/call follow-up for day 3 and day 7 post-visit

#### Pre-Attendee / Cold Outreach
- New contact type: `prospect` (does not require a visit record)
- Track referral source, connection to existing members, notes, and interest level
- Pipeline stages: `interested → invited → visited → connected → member`

#### Outreach Follow-Up Lifecycle
```
new_contact → welcome_sent → follow_up_scheduled → contacted → returning_visitor → connected → member
```

#### Outreach Dashboard (enhance existing First Impressions)
- Separate tabs: `Visitors` (existing) | `Follow-Up Queue` (existing, enhanced) | `Pipeline` (new)
- Pipeline Kanban or table view showing each prospect/visitor's current stage
- Days-since-first-visit metric on each card
- Conversion funnel chart: visitors → connected → member over time

### 4.4 Shared Infrastructure

Both inreach and outreach tasks will share an enhanced follow-up data model (see [Section 7](#7-database-changes-required)) and a unified assignment + notification workflow.

#### Assignment & Accountability
- Every follow-up task must have an `assigned_to` (profile ID) — currently optional
- Assignees receive a push notification when assigned (see Section 5)
- Assignees can log interaction notes directly on the follow-up task (follow-up activity log)
- Overdue tasks (past `due_date`) surface prominently in the assignee's dashboard

#### Activity Log on Each Follow-Up
Each follow-up will have a child `follow_up_activities` table:
```
id, follow_up_id, actor_id, activity_type (note|call|email|text|visit|status_change), content, created_at
```
This gives a full timeline of every interaction for pastoral accountability.

#### Bulk Operations
- Bulk assign follow-ups to a team member
- Bulk mark as contacted / closed
- Bulk reassign when a team member is unavailable

### 4.5 New UI Sections Required

| Component | Location | Description |
|---|---|---|
| `InreachDashboard` | `/admin?tab=inreach` | Member engagement overview, score table, trigger management |
| `EngagementScoreCard` | Admin > Inreach | Per-member score badge + trend sparkline |
| `FollowUpActivityLog` | Follow-up detail drawer | Timeline of interactions on a single follow-up |
| `OutreachPipeline` | First Impressions > Pipeline tab | Kanban/table of visitor pipeline stages |
| `AutoTriggerSettings` | Admin > Settings (new) | Configure automation rules (thresholds, default assignees) |
| Enhanced `FollowUpList` | First Impressions | Add `type` filter (inreach/outreach), assignee filter, overdue highlight |

---

## 5. Planned Feature: Push Notification System

### 5.1 Problem Statement

The app is entirely pull-based. Users must open it to discover new assignments, overdue follow-ups, or pending admin actions. This causes:
- Missed volunteer shift assignments
- Stale follow-up queues (tasks sit unactioned)
- Slow admin response to deletion/feedback requests

### 5.2 Notification Categories

| Category | Trigger | Recipient |
|---|---|---|
| `follow_up_assigned` | A follow-up task is assigned to a user | Assignee |
| `follow_up_overdue` | A follow-up passes its due_date unresolved | Assignee + their team lead |
| `roster_assigned` | A volunteer is assigned to a roster event | That volunteer |
| `roster_reminder` | 24h before a roster event the volunteer is assigned to | That volunteer |
| `first_visit_logged` | A new first-time attendee is logged | First Impressions team lead |
| `feedback_received` | A user submits feedback | Admin |
| `deletion_request` | A user submits an account deletion request | Admin |
| `inreach_trigger` | A member's engagement score drops to At Risk/Inactive | Their team lead (or configured pastoral care person) |
| `volunteer_inactive` | A volunteer has had no assignments in 30 days | Their team lead |

### 5.3 Delivery Mechanism

**Web Push (PWA)** — primary channel
- Use the Web Push API with VAPID keys
- Service worker already exists (Vite PWA plugin) — extend it to handle push events
- Store push subscriptions in a new `push_subscriptions` Supabase table
- Supabase Edge Function `send-push-notification` to fan out notifications
- Users opt-in via a notification permission prompt on first login

**In-App Notification Bell** — secondary channel
- `notifications` table stores all notifications regardless of push delivery
- Bell icon in the top nav with unread count badge
- Notification drawer listing recent notifications with mark-as-read
- This ensures notifications are never lost even if push is denied

**Email Fallback** — tertiary channel
- If a user has no active push subscription, fall back to email for high-priority notifications (overdue follow-ups, admin requests)
- Reuse the existing `send-email` Edge Function and email log

### 5.4 Architecture

```
Trigger Source
  │
  ├── Database trigger (Supabase pg_notify / Edge Function webhook)
  ├── Scheduled job (Supabase pg_cron for overdue/inactive checks)
  └── Manual action (user assigns follow-up, creates roster entry)
  │
  ▼
Supabase Edge Function: `notify`
  ├── Write to `notifications` table (in-app)
  ├── Look up push subscriptions for recipient(s)
  ├── Send Web Push via VAPID
  └── Fallback: call `send-email` if no push subscription
  │
  ▼
Client
  ├── Service worker handles push → shows OS notification
  └── React Query polling / Realtime subscription on `notifications` table
```

### 5.5 New Tables Required

```sql
-- Store browser push subscriptions per user
push_subscriptions (
  id uuid primary key,
  user_id uuid references auth.users not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now()
)

-- Persistent notification log (in-app bell)
notifications (
  id uuid primary key,
  recipient_id uuid references auth.users not null,
  type text not null,           -- matches category keys above
  title text not null,
  body text,
  data jsonb,                   -- arbitrary payload (e.g., follow_up_id, event_id)
  read_at timestamptz,
  created_at timestamptz default now()
)
```

### 5.6 New UI Components Required

| Component | Location | Description |
|---|---|---|
| `NotificationBell` | `AppLayout` top nav | Badge with unread count, opens `NotificationDrawer` |
| `NotificationDrawer` | Global overlay | List of recent notifications, mark read, navigate to item |
| `NotificationSettings` | Profile page | Per-category opt-in/opt-out, push permission request |
| `PushSubscriptionManager` | (hook) | Register/unregister service worker push subscription |
| Edge Function: `notify` | Supabase | Fan-out logic for all notification types |

---

## 6. Implementation Roadmap

### Phase 0 — Bug Fix (Immediate)
- [ ] Fix Roster Calendar RLS policies for team leads (migration + policy rewrite)
- [ ] Add `is_any_team_lead()` helper function

### Phase 1 — Foundation (2–3 weeks)
- [ ] Push notification infrastructure: VAPID setup, `push_subscriptions` table, `notifications` table
- [ ] `notify` Edge Function (write to DB + web push fan-out)
- [ ] `NotificationBell` + `NotificationDrawer` in `AppLayout`
- [ ] `NotificationSettings` on Profile page
- [ ] Service worker push handler (extend existing)

### Phase 2 — Outreach Automation (2–3 weeks)
- [ ] Enhance `follow_ups` table with `type` (inreach/outreach), `stage`, `prospect_pipeline_stage` columns
- [ ] `follow_up_activities` table and activity log UI component
- [ ] Auto-create outreach follow-up on first-visit attendee logging
- [ ] Welcome email automation (day-0 trigger)
- [ ] `OutreachPipeline` Kanban component in First Impressions
- [ ] Enhanced `FollowUpList` (type filter, assignee filter, overdue highlight)
- [ ] Notification: `first_visit_logged` → First Impressions team lead

### Phase 3 — Inreach System (3–4 weeks)
- [ ] `member_engagement` computed view or materialized table (attendance + roster participation)
- [ ] Engagement score calculation (Edge Function or DB function, runs nightly via pg_cron)
- [ ] `InreachDashboard` admin section with score table and filters
- [ ] `EngagementScoreCard` component
- [ ] Auto-trigger rules: attendance drop → create inreach follow-up
- [ ] Auto-trigger rules: volunteer inactive 30 days → flag for team lead
- [ ] `AutoTriggerSettings` configuration panel (thresholds, default assignees)
- [ ] Notification: `inreach_trigger` → team lead

### Phase 4 — Notifications for Existing Features (1–2 weeks)
- [ ] `roster_assigned` notification when a volunteer is added to an event
- [ ] `roster_reminder` notification 24h before an event (pg_cron)
- [ ] `follow_up_assigned` notification on assignment
- [ ] `follow_up_overdue` daily digest (pg_cron)
- [ ] `feedback_received` and `deletion_request` notifications to admins

### Phase 5 — Export & Reporting (1–2 weeks)
- [ ] CSV export: volunteer list, attendance report, follow-up summary
- [ ] Attendance analytics chart (Recharts trend chart in `WeeklyAttendance`)
- [ ] Engagement summary PDF/export (optional)

### Phase 6 — Additional Gaps (backlog)
- [ ] Kids check-out / guardian pickup flow
- [ ] Volunteer availability / scheduling preferences
- [ ] Bulk import (CSV) for volunteers and families
- [ ] Email template placeholder substitution wiring

---

## 7. Database Changes Required

### 7.1 Enhance `follow_ups` Table

```sql
ALTER TABLE public.follow_ups
  ADD COLUMN type text NOT NULL DEFAULT 'outreach'
    CHECK (type IN ('inreach', 'outreach')),
  ADD COLUMN stage text,
  ADD COLUMN prospect_pipeline_stage text
    CHECK (prospect_pipeline_stage IN (
      'interested', 'invited', 'visited', 'connected', 'member'
    )),
  ADD COLUMN inreach_trigger text,   -- e.g. 'attendance_drop', 'volunteer_inactive'
  ADD COLUMN priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- assigned_to is already nullable; make it encouraged via app-level validation
```

### 7.2 New Table: `follow_up_activities`

```sql
CREATE TABLE public.follow_up_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL REFERENCES public.follow_ups(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  activity_type text NOT NULL
    CHECK (activity_type IN ('note', 'call', 'email', 'text', 'visit', 'status_change')),
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_up_activities ENABLE ROW LEVEL SECURITY;
-- RLS: team leads and admins can read/insert for their team's follow-ups
```

### 7.3 New Table: `push_subscriptions`

```sql
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### 7.4 New Table: `notifications`

```sql
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY "Service role inserts notifications"
  ON public.notifications FOR INSERT TO service_role WITH CHECK (true);
```

### 7.5 New View: `member_engagement`

```sql
CREATE OR REPLACE VIEW public.member_engagement AS
SELECT
  p.id AS user_id,
  p.full_name,
  p.email,
  -- Attendance in last 90 days
  COUNT(DISTINCT wa.id) FILTER (
    WHERE wa.service_date >= now() - interval '90 days'
  ) AS attendance_90d,
  -- Roster participations in last 90 days
  COUNT(DISTINCT re.id) FILTER (
    WHERE re_event.date >= now() - interval '90 days'
  ) AS roster_participations_90d,
  -- Last attendance date
  MAX(wa.service_date) AS last_attendance_date,
  -- Days since last attendance
  EXTRACT(DAY FROM now() - MAX(wa.service_date))::int AS days_since_last_attendance,
  -- Computed band
  CASE
    WHEN MAX(wa.service_date) >= now() - interval '14 days' THEN 'active'
    WHEN MAX(wa.service_date) >= now() - interval '35 days' THEN 'drifting'
    WHEN MAX(wa.service_date) >= now() - interval '63 days' THEN 'at_risk'
    ELSE 'inactive'
  END AS engagement_band
FROM public.profiles p
LEFT JOIN public.weekly_attendance wa ON wa.user_id = p.id
LEFT JOIN public.roster_entries re ON re.user_id = p.id
LEFT JOIN public.roster_events re_event ON re_event.id = re.event_id
GROUP BY p.id, p.full_name, p.email;
```

### 7.6 Fix: RLS Policies on `roster_events`

```sql
-- Helper function
CREATE OR REPLACE FUNCTION public.is_any_team_lead(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND role = 'team_lead'
  )
$$;

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Team leads can insert roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can update roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can delete roster events" ON public.roster_events;

-- Recreate with null team_id support
CREATE POLICY "Team leads can insert roster events"
  ON public.roster_events FOR INSERT TO authenticated
  WITH CHECK (public.is_any_team_lead(auth.uid()));

CREATE POLICY "Team leads can update roster events"
  ON public.roster_events FOR UPDATE TO authenticated
  USING (public.is_any_team_lead(auth.uid())
    OR (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id)));

CREATE POLICY "Team leads can delete roster events"
  ON public.roster_events FOR DELETE TO authenticated
  USING (public.is_any_team_lead(auth.uid())
    OR (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id)));
```

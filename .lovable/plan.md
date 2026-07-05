# Plan: Kids How-To Guide + Order of Service

## Part 1 — Children's Ministry How-To Guide

Ship the same content in two places so volunteers see it in-context and admins can link to it from anywhere.

### 1a. New tab in the Children's Ministry dashboard
- Add a **Setup & Guide** tab in `src/pages/TeamDashboard.tsx` (childrens-ministry branch) alongside Check-In / Check-Out / Volunteers.
- New component `src/components/kids/KidsSetupGuide.tsx` renders the guide with collapsible sections, screenshots-worthy callouts, and copy buttons for commands.

### 1b. Help Center article (public)
- Expand `src/content/help/articles/kids-checkin.md` into a full walkthrough and add a new article `kids-setup.md` registered in `src/content/help/index.ts` under section "Children's Ministry".
- The in-tab component imports the same markdown so there is one source of truth.

### Guide sections
1. **How the system fits together** — plain-English diagram: kiosk (iPad/phone) → cloud (check-in saved) → bridge PC on same wifi → Brother QL printer. What each piece does and what happens if one is off.
2. **Print bridge PC setup** — hardware recommendation (any always-on Windows/Mac mini), install Node 18+, `cd print-bridge`, `npm install`, `./generate-cert.sh` (or `start-bridge.bat`), `npm start`. Auto-start on boot instructions for Windows (Task Scheduler) and macOS (LaunchAgent).
3. **Brother QL printer setup** — USB vs wifi pairing to the bridge PC, loading DK-2205 (2.4") continuous label roll, test print from the bridge's web page.
4. **Kiosk setup** — open `teams.hotc.life` on iPad/phone, sign in, add to Home Screen for full-screen mode, open Check-In tab, tap the printer icon → **Auto-find bridge**, one-time cert trust on iOS (screenshots-worthy steps).
5. **Day-of check-in / check-out flow** — search family, register new family, tap Check In, hand parent slip half, tape child slip, checkout by security code, offline banner behavior.
6. **Troubleshooting** — "printer offline" / "bridge not found" / "labels come out blank" / "iPad won't trust cert" quick fixes.

---

## Part 2 — Order of Service

Reusable service templates → generated weekly instances → per-slot assignments that flow into rosters, calendar, and notifications.

### Data model (new tables)

```text
service_templates                        (e.g. "Sunday 10am Main Service")
├─ name, description, default_start_time, default_duration_minutes,
│  team_ids (default serving teams), is_active

service_template_slots                   (ordered rows on a template)
├─ template_id → service_templates
├─ order_index, title, duration_minutes, notes,
│  default_team_id → teams (nullable), default_role_type_id (nullable)

service_instances                        (one Sunday's run sheet)
├─ template_id → service_templates (nullable — allows ad-hoc)
├─ roster_event_id → roster_events (link to calendar/roster)
├─ service_date, start_time, title, notes, status (draft/published/complete)

service_instance_slots                   (the actual run sheet rows)
├─ instance_id → service_instances
├─ order_index, title, duration_minutes, start_time (computed),
│  notes, team_id (nullable), role_type_id (nullable)

service_slot_assignments                 (who is doing what)
├─ slot_id → service_instance_slots
├─ assignee_type ('profile' | 'attendee'),
│  profile_id (nullable) / attendee_id (nullable),
│  role_label, status ('pending' | 'accepted' | 'declined')
```

All tables: RLS + grants. Read = authenticated. Write = admin OR team_lead of any team on the linked roster_event. Assignees can update their own assignment status.

### UI

New sidebar entry **Order of Service** under Administration (admin/team_lead visible), route `/admin?tab=order-of-service` with two sub-tabs:

- **Templates** — CRUD list of `service_templates` with an inline slot editor (drag-to-reorder, duration in minutes, optional default team + role type).
- **Upcoming Services** — list of `service_instances` grouped by month. "New from template" picks a template + date and generates the instance + slots; roster_event is auto-created (or linked to an existing one on that date).

**Run-sheet detail page** `/admin/order-of-service/:instanceId`:
- Header: title, date, start time, linked roster event badge, publish button.
- Timeline column: each slot shows computed clock time, duration, title, notes, assigned people chips.
- Per slot: **Assign** popover → pick team → pick member (or search directory). Adds a `service_slot_assignments` row and creates/updates a matching `roster_entries` row so it appears on their calendar and dashboard.
- Print-friendly view (`?print=1`) for tech booth / worship pastor.

### Integrations
- **Rosters** — creating a service_instance auto-creates a `roster_events` row (or links existing). Each slot assignment creates a `roster_entries` row on the linked event so it shows on the person's calendar and triggers accept/decline notifications.
- **Directory** — assignment picker uses the existing directory search (attendees + profiles) with team-first filtering per user's answer ("pick a team, then a member" with a "Search everyone" fallback).
- **Calendar** — service_instance surfaces in the existing `RosterCalendarView` via its linked roster_event; clicking opens the run-sheet.
- **Notifications** — reuse the existing roster assignment notification flow so no new email path is needed.

### Help
Add `src/content/help/articles/order-of-service.md` explaining templates → weekly service → assignments, registered in the help index (section "Teams & Scheduling", role team_lead).

---

## Technical notes
- Migration order: create tables → GRANT to authenticated + service_role → enable RLS → policies using `has_role('admin')`, `is_any_team_lead`, and assignment-owner checks → `updated_at` triggers.
- Slot start_time is derived client-side from service start + cumulative durations; no need to store it.
- Deleting a service_instance cascades to slots + assignments and removes the auto-created roster_entries linked to those slots (but leaves the roster_event if it has other entries).
- Reuse existing shadcn primitives (Tabs, Popover, Command, Dialog, Sheet, Sortable via `@dnd-kit`).
- No new secrets, no new edge functions.

---

## Files touched (approx.)
**New**
- `src/components/kids/KidsSetupGuide.tsx`
- `src/content/help/articles/kids-setup.md`
- `src/content/help/articles/order-of-service.md`
- `src/components/admin/OrderOfServicePanel.tsx`
- `src/components/admin/ServiceTemplateEditor.tsx`
- `src/components/admin/ServiceInstanceRunSheet.tsx`
- `src/components/admin/SlotAssignPopover.tsx`
- `src/hooks/useOrderOfService.ts`
- `src/pages/ServiceRunSheet.tsx`
- Migration for the 5 new tables + policies

**Edited**
- `src/pages/TeamDashboard.tsx` — new Setup & Guide tab
- `src/content/help/articles/kids-checkin.md` — trim; link to new setup article
- `src/content/help/index.ts` — register 2 new articles
- `src/pages/AdminPanel.tsx` — new "Order of Service" tab
- `src/components/layout/AppSidebar.tsx` — add tab entry
- `src/App.tsx` — route for run-sheet detail page

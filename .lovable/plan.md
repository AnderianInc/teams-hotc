## Plan: Make scheduling and Order of Service functional

### 1. Clarify the system design in the app
The app will use one clear workflow:

```text
Admin creates master service schedule
  -> service date/time/name
  -> teams required for that service
  -> optional order-of-service run sheet

Team leaders open their team schedule
  -> see only services their team is assigned to
  -> assign members from their team to that service/date
  -> manage/edit only their team’s member assignments

Members see their assigned dates
  -> accept/decline from their dashboard/calendar
```

### 2. Fix the Admin schedule experience
- Replace the current “calendar block” workflow with a more usable master schedule manager.
- Admin can create/edit/delete service dates with:
  - service name
  - date
  - time
  - description/notes
  - participating teams
- Calendar cells will show meaningful information instead of vague blocks:
  - service name
  - time
  - team count
  - assignment progress, e.g. `3 / 8 assigned`
- Day detail modal will show each service as a structured service card:
  - Time
  - Teams required
  - Assigned people grouped by team
  - Admin controls for editing service/team setup

### 3. Fix the Team schedule experience
- Team leaders should not create master service dates.
- In each Team Dashboard → Schedule:
  - show services created by admin where that team is included
  - provide an “Assign members” action for that team only
  - filter member picker to that team’s members
  - support role/position selection using that team’s role types
  - show accepted / pending / declined assignment status
- Remove or de-emphasize confusing standalone/list views that duplicate the schedule and make it unclear what to use.

### 4. Repair permissions
- Backend/database rules will enforce the intended access model:
  - Admin: full access to create/update/delete master service dates and attached teams.
  - Team leads: can view services for their teams and assign/remove/update members only for teams they lead.
  - Members: can view/respond to their own assignments.
- UI controls will match this:
  - Admin sees full schedule editing tools.
  - Team leaders see assignment tools, not master schedule editing tools.
  - Members see read-only assignments and response actions where applicable.

### 5. Reconnect Order of Service to the master schedule
- Order of Service will be tied to a scheduled service date instead of feeling like a separate non-functional feature.
- Admin can create or open the order-of-service run sheet from a master service.
- The run sheet will show:
  - service time/date
  - ordered time slots
  - slot duration
  - assigned team
  - assigned person/people
- Assignments made in Order of Service will continue to create roster/calendar assignments, but will respect the service’s teams and member lists.
- Team users will keep view-only access to published run sheets.

### 6. Clean up current UI labels and help text
- Rename confusing labels so the app clearly separates:
  - “Master Schedule” for admin-created service dates
  - “Team Assignments” for team leaders filling those dates
  - “Order of Service” for the service run sheet
- Update the schedule/help wording to match the actual workflow.

### 7. Validation
- Verify these flows:
  - Admin creates a Sunday service with multiple teams.
  - Team dashboard immediately shows that service for each assigned team.
  - A team leader assigns a member to the service.
  - The assignment appears in the admin schedule, team schedule, and member roster/calendar.
  - Admin creates/opens an Order of Service for that same service.
  - Team members can view the published Order of Service but cannot edit it.
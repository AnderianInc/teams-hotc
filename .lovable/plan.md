

## Fix Roster Calendar: Event Creation, Deletion, and Assignment Issues

### Root Cause Analysis

There are two key problems:

1. **RLS blocking event creation**: When creating events from the admin calendar, `team_id` is set to `null` (since events are now top-level entities with teams linked via `roster_event_teams`). The team lead INSERT policy on `roster_events` requires `team_id IS NOT NULL`, so it fails silently. Only the admin ALL policy works, but if the current user's admin role isn't detected, nothing happens.

2. **RLS blocking event deletion**: The `deleteEvent` mutation deletes from `roster_entries`, `roster_event_teams`, and `roster_events` in sequence. The team lead DELETE policy on `roster_events` also requires `team_id IS NOT NULL`, so deleting top-level events (with `team_id = null`) fails for team leads.

3. **Assign dialog member loading**: The `members` query in `RosterCalendarView` depends on `assignTeamId`, which loads members for the selected team. This works correctly but the `roleTypes` query uses `activeTeamId` (a derived value from `assignTeamId || editTeamId`) which could be stale.

### What Gets Fixed

**1. Database Migration — Fix RLS policies for top-level events**
- Update `roster_events` INSERT policy for team leads to also allow inserting when `team_id IS NULL` if the user is a team lead of any team (since the team association goes through the junction table)
- Update `roster_events` DELETE and UPDATE policies similarly
- Alternative (simpler): Allow team leads to insert/update/delete events where `team_id IS NULL` by checking if they lead any team

**2. RosterCalendarView.tsx — Ensure dialogs and mutations work**
- Verify the create event flow properly opens and submits
- Ensure delete event cascade works (entries → event_teams → events)
- Fix the assign volunteer flow to correctly load members based on the selected team within the event

**3. RosterEventManager.tsx — Team dashboard event management**
- Same RLS fix applies; team leads creating events with `team_id = null` need the policy update

### Technical Details

**Migration SQL:**
```sql
-- Drop restrictive team lead policies on roster_events
DROP POLICY IF EXISTS "Team leads can insert roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can delete roster events" ON public.roster_events;
DROP POLICY IF EXISTS "Team leads can update roster events" ON public.roster_events;

-- Create a helper function: is user a lead of ANY team?
CREATE OR REPLACE FUNCTION public.is_any_team_lead(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND role = 'team_lead'
  )
$$;

-- Team leads can insert events (top-level with null team_id)
CREATE POLICY "Team leads can insert roster events"
ON public.roster_events FOR INSERT TO authenticated
WITH CHECK (public.is_any_team_lead(auth.uid()));

-- Team leads can update events they created or that link to their team
CREATE POLICY "Team leads can update roster events"
ON public.roster_events FOR UPDATE TO authenticated
USING (
  public.is_any_team_lead(auth.uid())
  OR (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id))
);

-- Team leads can delete events
CREATE POLICY "Team leads can delete roster events"
ON public.roster_events FOR DELETE TO authenticated
USING (
  public.is_any_team_lead(auth.uid())
  OR (team_id IS NOT NULL AND is_team_lead(auth.uid(), team_id))
);
```

**Files to modify:**
- `src/components/admin/RosterCalendarView.tsx` — Add better error handling/toast on mutation failures, ensure the day-click → create event flow works end-to-end
- `src/components/teams/RosterEventManager.tsx` — Same error handling improvements

**Files to create:**
- New migration for RLS policy updates and `is_any_team_lead` function


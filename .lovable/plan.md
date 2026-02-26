

## QR Code Check-In with Member Type Differentiation

### Overview
Build a public `/check-in` page where anyone at church can scan a QR code and check in. The page will present two clear paths: one for **volunteers/staff** (who have app accounts) and one for **regular church members** (tracked in the `attendees` table). Admins can display/print the QR code from the Attendance tab.

### User Flow

```text
Scan QR Code --> /check-in page
                    |
         +----------+----------+
         |                     |
   "I'm a Volunteer/Staff"   "I'm a Church Member"
         |                     |
   Search profiles table    Search attendees table
         |                     |
   Tap name -> confirm      Tap name -> confirm
         |                     |        |
   Records user_id          Records attendee_id
   in weekly_attendance      in weekly_attendance
                               |
                         (or register as new
                          member if not found)
```

### What Gets Built

**1. Public Check-In Page (`src/pages/CheckIn.tsx`)**
- Mobile-optimized, no login required
- Two large buttons at top: "Volunteer / Staff" and "Church Member"
- Search box appears after selecting type
- **Volunteer/Staff path**: searches `profiles` table by name, shows matching names with team badges
- **Church Member path**: searches `attendees` table by name, shows matches; includes a "Not found? Register" option that captures first name, last name, and phone
- Tap to select -> confirmation screen with checkmark animation -> done
- Prevents duplicate check-ins for the same service date

**2. Edge Function (`supabase/functions/self-check-in/index.ts`)**
- Public endpoint (no JWT required)
- Accepts: `{ type: "volunteer" | "member", user_id?: string, attendee_id?: string, full_name?: string }`
- For volunteers: validates `user_id` exists in `profiles`, inserts into `weekly_attendance` with `user_id` set, `is_self_reported = true`
- For members: validates `attendee_id` exists in `attendees`, inserts into `weekly_attendance` with `attendee_id` set (uses a placeholder system user_id or null-safe approach)
- For new members: creates a new `attendees` record first, then records attendance
- Checks for duplicate check-ins on the same `service_date`
- Uses service role key to bypass RLS

**3. QR Code Button in Attendance Tab (`WeeklyAttendance.tsx`)**
- "Show QR Code" button in the header next to week navigation
- Opens a dialog with a QR code pointing to the published URL `/check-in`
- Print button (reuses the pattern from `QRCodeDisplay.tsx`)

**4. Attendance Tab Updates (`WeeklyAttendance.tsx`)**
- Add a toggle/tabs to switch between "Volunteers/Staff" and "Church Members" views
- Volunteers view: current behavior (profiles + team_members data)
- Members view: shows attendees from the `attendees` table with their check-in status for the selected week
- Stats section updated to show combined or per-type counts
- Self-reported entries shown with a small indicator badge

**5. Database Migration**
- Make `user_id` nullable on `weekly_attendance` (currently NOT NULL) so member-only check-ins (attendee_id without a user account) can be recorded
- Add unique constraint on `(service_date, user_id)` and `(service_date, attendee_id)` to prevent duplicate check-ins
- Add RLS policy allowing the edge function (service role) to insert records

**6. Route Registration (`App.tsx`)**
- Add `/check-in` as a public route (outside ProtectedRoute, like `/welcome`)

**7. Config Update (`supabase/config.toml`)**
- Add `[functions.self-check-in]` with `verify_jwt = false`

### Technical Details

**Files to create:**
- `src/pages/CheckIn.tsx` -- public self-service check-in page with dual-path UI
- `supabase/functions/self-check-in/index.ts` -- backend function for recording attendance

**Files to modify:**
- `src/App.tsx` -- add `/check-in` route outside protected wrapper
- `src/components/admin/WeeklyAttendance.tsx` -- add QR code button, member/volunteer tabs, show self-reported indicator
- `supabase/config.toml` -- register `self-check-in` function

**Database migration:**
- `ALTER TABLE weekly_attendance ALTER COLUMN user_id DROP NOT NULL` -- allow member-only records
- Add partial unique indexes for duplicate prevention
- Add index on `attendee_id` for efficient member lookups


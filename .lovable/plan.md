

# Plan: Invite Flow Fixes, Church Directory, and First Impressions QR System

## Overview
This plan addresses five areas: fixing the invite email content and flow, adding a profile completion page for invitees, building a unified church directory, and creating a QR-based first-timer registration system with automated welcome emails.

---

## 1. Fix Invite Email (Single Email, Correct Church Name)

**Problem:** Currently, `inviteUserByEmail` sends a Supabase system email AND a second Resend email. The Resend email says "House on the Corner" (wrong) and tells the user to check for another email.

**Fix:** Instead of calling `inviteUserByEmail` (which sends its own email), use `adminClient.auth.admin.createUser()` with `email_confirm: true` to create the user silently, then generate a magic link via `adminClient.auth.admin.generateLink({ type: 'magiclink', email })`. Send ONE email via Resend with that link, branded as **House of Transformation Church (HOTC)**.

**File:** `supabase/functions/invite-volunteer/index.ts`

The email will include:
- Correct church name: "House of Transformation Church"
- Team name they're being invited to
- A single "Accept Invitation" button linking to the app with the magic link token
- The link will redirect to a profile completion page

---

## 2. Profile Completion Page for New Volunteers

**Problem:** When a new volunteer clicks the invite link, they land on the app but have no way to add their name, phone, or set a password.

**Solution:** Create a `/complete-profile` page that:
- Detects if the user arrived via a magic link (auth state change)
- Prompts them to set their full name and a password
- Optionally collect phone number
- Updates their `profiles` record and sets their password via `supabase.auth.updateUser()`
- Redirects to the dashboard afterward

**Files:**
- `src/pages/CompleteProfile.tsx` (new)
- `src/App.tsx` (add route)

---

## 3. Church Directory (Volunteers Are Members Too)

**Problem:** Volunteers are church members and should appear in a unified church directory. Currently the `attendees` table tracks visitors/members separately from `profiles` (which tracks app users/volunteers).

**Solution:** Add an `attendee_id` column to the `profiles` table to optionally link a volunteer's app account to their `attendees` record. This connects the two systems without duplicating data.

- When a volunteer is invited, also create/link an `attendees` record with `is_member: true`
- Add a "Church Directory" tab (or section) in the Admin Panel that shows all attendees, with a badge indicating if they're also a volunteer/team member
- The `attendees` table becomes the single source of truth for the church directory

**Database Migration:**
- Add `attendee_id uuid REFERENCES attendees(id)` to `profiles` (nullable)
- Update `invite-volunteer` edge function to create an attendee record when inviting

**Files:**
- Migration SQL
- `supabase/functions/invite-volunteer/index.ts` (link attendee record)
- `src/components/admin/ChurchDirectory.tsx` (new) or enhance existing `AttendeeList`
- `src/pages/AdminPanel.tsx` (add Directory tab)

---

## 4. First Impressions QR Code Registration System

**Problem:** First-time visitors need a frictionless way to provide their details when they walk into church.

**Solution:** Build a public-facing registration form + QR code system:

### 4a. Public Visitor Registration Page
- Create a `/welcome` route that is NOT protected (no login required)
- A clean, mobile-friendly form asking for: first name, last name, email, phone, address, how they heard about the church, prayer requests
- On submit: inserts into the `attendees` table via an edge function (since the page is unauthenticated, RLS won't allow direct inserts)
- Automatically creates a follow-up record with status "pending"
- Shows a thank-you screen after submission

### 4b. Welcome Email Automation
- After a first-timer registers, the edge function sends a welcome email via Resend from `hotc@pneumanation.com`
- Content: Welcome message, service times, next steps (e.g., "Join us for newcomers lunch"), contact info

### 4c. QR Code Display for Admins
- In the First Impressions dashboard, add a "QR Code" section that generates/displays a QR code pointing to the `/welcome` URL
- Admins can print this QR code for bulletins, welcome desks, signage, etc.

**Database Migration:**
- Add `how_heard text` and `prayer_requests text` columns to `attendees` table
- Create an RLS policy or use edge function for anonymous inserts

**Files:**
- `supabase/functions/register-visitor/index.ts` (new edge function for unauthenticated registration)
- `src/pages/Welcome.tsx` (new public page)
- `src/App.tsx` (add public route)
- `src/components/first-impressions/QRCodeDisplay.tsx` (new)
- `src/components/first-impressions/FirstImpressionsDashboard.tsx` (add QR tab)

---

## 5. Database Changes Summary

```text
Migration 1: Schema updates
+--------------------------------------------------+
| ALTER TABLE profiles                             |
|   ADD COLUMN attendee_id uuid REFERENCES         |
|   attendees(id) ON DELETE SET NULL;              |
+--------------------------------------------------+
| ALTER TABLE attendees                            |
|   ADD COLUMN how_heard text;                     |
|   ADD COLUMN prayer_requests text;               |
+--------------------------------------------------+
```

---

## Technical Summary

| Task | Files Changed |
|------|--------------|
| Fix invite email (single email, correct name) | `invite-volunteer/index.ts` |
| Profile completion page | New `CompleteProfile.tsx`, `App.tsx` |
| Church directory linking | Migration, `invite-volunteer/index.ts`, new `ChurchDirectory.tsx`, `AdminPanel.tsx` |
| QR visitor registration | New `register-visitor` edge function, new `Welcome.tsx`, `QRCodeDisplay.tsx`, `FirstImpressionsDashboard.tsx` |
| Welcome email automation | Inside `register-visitor` edge function |

## Implementation Order

1. Database migration (add `attendee_id` to profiles, add columns to attendees)
2. Fix `invite-volunteer` edge function (single Resend email with magic link, create attendee record)
3. Create `CompleteProfile.tsx` page and add route
4. Create `register-visitor` edge function (public form handler + welcome email)
5. Create `/welcome` public page
6. Add QR code display to First Impressions dashboard
7. Add Church Directory tab to Admin Panel


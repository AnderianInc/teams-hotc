

# Plan: Enhanced Church Directory, Birthday Messages, and Invite Management

## Overview
Three enhancements: (1) add birthday column to attendees and directory with automated birthday email, (2) add team membership info to the directory view, and (3) add resend/edit capability for volunteer invitations.

---

## 1. Add Birthday Field and Birthday Email System

### Database Migration
- Add `date_of_birth date` column to the `attendees` table (nullable)

### Church Directory Update (`ChurchDirectory.tsx`)
- Add a "Birthday" column showing the date (formatted as month/day)
- Also fetch team membership info: query `team_members` joined with `teams` via profiles' `attendee_id` to show which team(s) each person belongs to
- Add a "Team" column displaying team name badges

### Birthday Email Edge Function
- Create `supabase/functions/send-birthday-emails/index.ts`
- Queries `attendees` where `date_of_birth` month/day matches today and email is not null
- Sends a branded birthday email via Resend from `hotc@pneumanation.com`
- Designed to be called daily via a cron job (pg_cron + pg_net)
- Set up the cron schedule to invoke this function once per day

### Profile Completion Page Update (`CompleteProfile.tsx`)
- Add a "Date of Birth" field so new volunteers can provide their birthday during onboarding
- Save it to the linked `attendees` record

---

## 2. Enhanced Church Directory with Team Info

### Update `ChurchDirectory.tsx`
- Fetch `team_members` with `teams` and `profiles` to map attendee_id to team names
- Add "Team(s)" column showing team badges (e.g., "Worship", "First Impressions")
- Add "Birthday" column
- Keep existing status badges (Member, Volunteer, Visitor, First Timer)

---

## 3. Resend/Edit Invitations

### Update `VolunteerManagement.tsx`
- Show invite status: for each profile, indicate if they've completed setup (have a `full_name` set) or are still pending
- Add a "Resend Invite" button per pending volunteer that calls `invite-volunteer` again with the same email/team/role -- this generates a fresh magic link and re-sends the email
- Add an "Edit" button that opens a dialog to change the volunteer's assigned team or role, then updates `team_members` accordingly

### Update `invite-volunteer/index.ts`
- When the user already exists (existing user path), also generate a new magic link and send a fresh invite email via Resend (currently it skips the email for existing users)
- This enables the "resend" functionality

---

## Technical Summary

| Task | Files Changed |
|------|--------------|
| Add birthday column | New migration |
| Birthday email function | New `send-birthday-emails/index.ts`, cron SQL |
| Enhanced directory | `ChurchDirectory.tsx` |
| Profile completion birthday | `CompleteProfile.tsx` |
| Resend/edit invites | `VolunteerManagement.tsx`, `invite-volunteer/index.ts` |
| Config update | `supabase/config.toml` (add `send-birthday-emails`) |

## Implementation Order

1. Database migration (add `date_of_birth` to attendees)
2. Update `invite-volunteer` edge function to support resending for existing users
3. Update `VolunteerManagement.tsx` with resend/edit invite buttons
4. Update `ChurchDirectory.tsx` with birthday and team columns
5. Update `CompleteProfile.tsx` with birthday field
6. Create `send-birthday-emails` edge function
7. Set up daily cron job for birthday emails


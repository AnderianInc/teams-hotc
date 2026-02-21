

# Plan: Enhanced Registration, Shared Family Data, and Email Setup

## Overview
This plan addresses three areas: improving Kids Check-In registration (siblings, search fix, family editing), sharing family data across ministries, and configuring email delivery via Resend.

---

## 1. Fix Broken Search Query

The children search is failing with a 400 error because PostgREST does not support filtering on related table columns (like `families.family_name`) inside `.or()`. 

**Fix:** Search only on `children` columns (`first_name`, `last_name`) in the `.or()` filter. For phone/family name searches, run a separate query on the `families` table and merge results client-side, or simplify to just child name search.

**File:** `src/components/kids/KidsCheckIn.tsx`

---

## 2. Fix Team Members Query (profiles join)

The `TeamMemberManager` query `profiles:user_id(full_name, email)` fails because there is no foreign key from `team_members.user_id` to `profiles.user_id`.

**Fix:** Add a foreign key constraint from `team_members.user_id` to `profiles.user_id` via migration, OR change the query to fetch profiles separately and join in code.

**Approach:** Add FK via migration (cleaner).

---

## 3. Add Sibling Support to Registration

**File:** `src/components/kids/RegisterChild.tsx`

- Add a dynamic "siblings" array to the form state
- Each sibling entry has: first name, last name, date of birth, grade/age group, allergies, medical notes
- "Add Sibling" button appends a new blank sibling row
- On submit: create the family once, then insert all children (primary + siblings) linked to that family
- After registration, navigate to check-in for the first child

---

## 4. Family Details Editing

Create a new component `EditFamily.tsx` accessible from the check-in confirm screen.

- When a child is selected for check-in, show an "Edit Family" button
- Opens a dialog/form pre-filled with the family's current data (parent names, phones, family name)
- Also lists all children in the family with editable fields
- Saves updates to both `families` and `children` tables

**Files:**
- `src/components/kids/EditFamily.tsx` (new)
- `src/components/kids/CheckInConfirm.tsx` (add Edit Family button)

---

## 5. Shared Family Data Access for First Impressions

Currently, `families` and `children` tables are restricted to Kids Ministry members only. First Impressions needs read access to family data.

**Database Migration:**
- Update RLS SELECT policies on `families` table to also allow `is_first_impressions_member(auth.uid())`
- Update RLS SELECT policies on `children` table to also allow `is_first_impressions_member(auth.uid())`
- This way First Impressions can view family/child records but only Kids Ministry can create/update them

---

## 6. Email Configuration with Resend API

The current invite system uses Supabase's built-in `inviteUserByEmail` which sends emails through Supabase's default SMTP. To use your custom domain (hotc@pneumanation.com via Resend):

**Steps:**
1. Store the Resend API key as a backend secret (`RESEND_API_KEY`)
2. Update `supabase/config.toml` -- actually this is auto-managed, so instead we configure the SMTP settings through the Supabase auth configuration
3. The simplest approach: configure auth emails to use Resend's SMTP relay. However, since we can't modify auth SMTP settings directly in Lovable Cloud, an alternative is:
   - Create a `send-email` edge function that uses the Resend HTTP API directly
   - Update `invite-volunteer` to generate a custom invite link and send the email via the `send-email` function instead of `inviteUserByEmail`

**Preferred approach:** Create a `send-email` edge function using Resend's API, and update the invite flow to use it. This gives full control over email templates and sender address.

**Files:**
- `supabase/functions/send-email/index.ts` (new)
- `supabase/functions/invite-volunteer/index.ts` (updated to use Resend)

---

## Technical Summary

| Task | Files Changed |
|------|--------------|
| Fix search query | `KidsCheckIn.tsx` |
| Fix team members FK | New migration |
| Sibling registration | `RegisterChild.tsx` |
| Family editing | New `EditFamily.tsx`, `CheckInConfirm.tsx` |
| Shared data RLS | New migration (update SELECT policies on `families`, `children`) |
| Resend email setup | New `send-email` edge function, updated `invite-volunteer` |

## Implementation Order

1. Database migration (FK fix + shared RLS policies)
2. Fix search query in `KidsCheckIn.tsx`
3. Enhance `RegisterChild.tsx` with sibling support
4. Create `EditFamily.tsx` and integrate into check-in flow
5. Request Resend API key secret from user
6. Create `send-email` edge function
7. Update `invite-volunteer` to use Resend




# Volunteer Profile Page

## Overview
Add a dedicated profile page where volunteers can view and edit their personal bio information like phone number, date of birth, address, and a short bio/about section.

## What You'll See
- A new "My Profile" link in the sidebar (available to all logged-in users)
- A profile page at `/profile` showing your current info with editable fields:
  - **Full Name**
  - **Phone Number**
  - **Date of Birth**
  - **Address**
  - **Bio / About Me** (short text about yourself)
  - **Avatar URL** (existing field, now editable)
- A save button to update your information

## Technical Details

### 1. Database Changes
Add new columns to the `profiles` table for the additional bio fields:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS bio text;
```

No RLS changes needed -- the existing policy already allows users to update their own profile (`auth.uid() = user_id`).

### 2. New Files
- **`src/pages/Profile.tsx`** -- The profile page with a form to view/edit bio fields. Loads the current user's profile on mount, allows editing, and saves via Supabase update.

### 3. Modified Files
- **`src/App.tsx`** -- Add a `/profile` route inside the protected layout
- **`src/components/layout/AppSidebar.tsx`** -- Add a "My Profile" link (User icon) in the sidebar footer, above the sign-out button

### 4. Implementation Approach
- On page load, fetch the user's profile row from the `profiles` table
- Display all fields in a clean card layout with input fields
- On save, update the `profiles` table (RLS ensures only own profile)
- Show success/error toast notifications
- The `CompleteProfile` page (onboarding) will also save phone to the new `phone` column


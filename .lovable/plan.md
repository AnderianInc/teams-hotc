# Fix duplicate directory entries when adding people to teams

## What's happening today

Adding someone to a team has two paths:

1. **Find Existing** — searches only `profiles` (people who already have a login). Anyone in the directory who has never signed in (an `attendees` record) is invisible here.
2. **Invite by Email** — because path 1 can't find them, staff fall back to this. The invite function then creates a brand new auth account **and always inserts a brand new `attendees` row**, using the email prefix as first name and a blank last name — even when that person already exists in the directory.

That second step is the duplicate. Confirmed in the data: two email addresses currently have two `attendees` rows each, and one profile has no directory link at all.

## The fix

### 1. Search the whole directory when adding a team member

Replace the profiles-only search in the "Add Member" dialog with a unified directory search across `profiles` and `attendees` (name or email), de-duplicated so a person who exists in both appears once. Each result shows whether they already have a login. People already on the team are filtered out.

### 2. Never create a second directory record

Rework the invite path so it links instead of inserting:

- Look up an existing `attendees` row by email (case-insensitive) before creating anything.
- If found, reuse it and link it to the profile — do not insert.
- Only insert a new `attendees` row when no directory match exists, and populate first/last name properly instead of using the email prefix.
- Accept an explicit directory record id from the UI so a person picked from search is linked with certainty, not guessed by email.

### 3. Adding a directory person with no login

When the picked person has no account yet, the same action provisions their login from their existing directory record (name, email, phone carried over) and adds them to the team. One person, one directory entry, any number of teams.

### 4. Clean up existing duplicates

Merge the two duplicated email pairs already in the directory: keep the record with the richer data and the profile/attendance links, move relationships/check-ins/follow-ups to it, delete the empty shell. This is a one-off data change presented for approval separately.

## Technical notes

- `src/components/teams/TeamMemberManager.tsx`: replace `search-profiles` query with a combined `profiles` + `attendees` search; pass `attendeeId` when adding; add-existing path stays a direct `team_members` insert when a `user_id` exists.
- `supabase/functions/invite-volunteer/index.ts`: accept optional `attendeeId`, `firstName`, `lastName`; replace the unconditional `attendees` insert with a lookup-then-link flow; keep the existing auth-user reuse logic.
- `src/components/admin/VolunteerManagement.tsx` and `BulkImport.tsx` also call `invite-volunteer` — they keep working unchanged and inherit the no-duplicate behaviour.
- No schema changes needed; `profiles.attendee_id` already exists as the link.

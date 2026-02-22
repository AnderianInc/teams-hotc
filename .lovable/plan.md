

# Plan: Four Fixes — QR URL, Directory, Email Management, and Team Type

## 1. QR Code: Hardcode URL to `hotc.life`

**File:** `src/components/first-impressions/QRCodeDisplay.tsx`

Currently uses `window.location.origin` which resolves to the Lovable preview URL. Change to hardcoded `https://hotc.life/welcome` so the QR code always points to the production domain regardless of where the admin is viewing it.

---

## 2. Church Directory Not Showing Volunteers

**Root Cause:** The directory only queries the `attendees` table, but volunteers exist only in the `profiles` table with no `attendee_id` link. The `attendees` table is currently empty.

**Fix in `ChurchDirectory.tsx`:**
- Query both `attendees` and `profiles` tables
- Merge the two datasets: profiles that have an `attendee_id` get matched to their attendee record; profiles without one appear as standalone entries
- This ensures all volunteers show up even if they were never registered as attendees
- Display name from `profiles.full_name` (split into first/last) for volunteer-only entries, and from `attendees` for linked entries

---

## 3. Email & Communications Management

Create a new **Communications** tab in the Admin Panel with:

### Email Composer
- A form to compose and send emails: recipient (select from directory or type email), subject, HTML body
- AI-assisted composition: a "Draft with AI" button that calls a backend function using a supported AI model to generate email content based on a prompt (e.g., "write a follow-up email to a first-time visitor")
- Calls the existing `send-email` edge function to send

### Email Log Table
- New `email_log` database table: `id`, `to_email`, `to_name`, `subject`, `body_html`, `sent_at`, `sent_by` (user_id), `related_attendee_id` (nullable), `status`
- Update the `send-email` edge function to log every sent email into this table
- Display a table of all sent emails with date, recipient, subject, and status
- Click to view the full email body

### Follow-Up Email Integration
- In the Follow-Up list, add a "Send Email" action button on each row that opens the email composer pre-filled with the attendee's email and a suggested follow-up message
- The AI can draft the follow-up based on the attendee's details and follow-up notes

### Database Migration
```sql
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_html text,
  sent_at timestamptz DEFAULT now(),
  sent_by uuid REFERENCES auth.users(id),
  related_attendee_id uuid,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and FI can read email log"
  ON public.email_log FOR SELECT
  USING (has_role(auth.uid(), 'admin') OR is_first_impressions_member(auth.uid()));

CREATE POLICY "Admins and FI can insert email log"
  ON public.email_log FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin') OR is_first_impressions_member(auth.uid()));
```

### Updated Edge Function (`send-email`)
- Accept optional `logged_by` (user_id), `to_name`, and `related_attendee_id` fields
- After sending via Resend, insert a row into `email_log`

### New Files
- `src/components/admin/EmailComposer.tsx` — compose form with AI draft button
- `src/components/admin/EmailLog.tsx` — sent email history table
- `src/components/admin/CommunicationsPanel.tsx` — tab wrapper for composer + log

### Admin Panel Update
- Add "Communications" tab in `AdminPanel.tsx`

---

## 4. Team Type Selection When Creating Teams

**File:** `src/components/admin/TeamManagement.tsx`

The create team form currently only has Name and Description. Add a "Team Type" field:
- Radio group or select with two options: **Ministry** and **Volunteer**
- Pass `team_type` in the insert mutation (currently defaults to `'volunteer'`)

---

## Technical Summary

| Task | Files |
|------|-------|
| QR URL fix | `QRCodeDisplay.tsx` |
| Directory fix | `ChurchDirectory.tsx` |
| Email log table | New migration |
| Email management | New `EmailComposer.tsx`, `EmailLog.tsx`, `CommunicationsPanel.tsx` |
| Update send-email | `send-email/index.ts` |
| Follow-up email button | `FollowUpList.tsx` |
| Admin panel tab | `AdminPanel.tsx` |
| Team type selector | `TeamManagement.tsx` |

## Implementation Order

1. Database migration (email_log table)
2. QR code URL fix
3. Church directory fix (merge profiles + attendees)
4. Team type selector in create form
5. Update send-email edge function to log emails
6. Email composer with AI drafting
7. Email log viewer
8. Communications tab in admin panel
9. Follow-up email button integration

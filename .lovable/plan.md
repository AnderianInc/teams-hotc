

# Plan: Address Autocomplete, Editable Email Templates, and Directory Deletion

## 1. Real-Time Address Lookup on Welcome Form

Use the **Google Places Autocomplete API** to provide real-time address suggestions as visitors type in the address field.

### Approach
- Create a new edge function `address-autocomplete` that proxies requests to the Google Places API (keeps the API key server-side and secure)
- Replace the plain `Input` for address in `Welcome.tsx` with a custom `AddressAutocomplete` component that calls this edge function as the user types (debounced) and displays suggestions in a dropdown
- A Google Maps API key will be needed as a secret

### New Files
- `supabase/functions/address-autocomplete/index.ts` -- proxies to Google Places Autocomplete API
- `src/components/welcome/AddressAutocomplete.tsx` -- debounced input with suggestion dropdown

### Modified Files
- `src/pages/Welcome.tsx` -- swap plain `Input` for `AddressAutocomplete`
- `supabase/config.toml` -- add `[functions.address-autocomplete]` with `verify_jwt = false`

---

## 2. Editable Email Templates

Currently, all email HTML is hardcoded inside the edge functions (`register-visitor`, `invite-volunteer`, `send-birthday-emails`). There is no way for admins to edit these templates.

### Approach
- Create an `email_templates` database table to store templates by a unique slug (e.g., `welcome-visitor`, `volunteer-invite`, `birthday`)
- Each template has a `subject` pattern and `body_html` pattern with `{{placeholder}}` merge tags (e.g., `{{firstName}}`, `{{teamName}}`)
- Build an **Email Templates** management UI in the Admin Panel Communications tab where admins can view, edit, and preview each template
- Update the three edge functions to load the template from the database and perform placeholder substitution instead of using hardcoded HTML
- Seed the database with the current hardcoded templates so nothing breaks

### Database Migration
```sql
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  placeholders text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Only admins can manage templates
CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Seed with current templates
INSERT INTO public.email_templates (slug, name, subject, body_html, placeholders) VALUES
  ('welcome-visitor', 'Welcome Visitor', 'Welcome to House of Transformation Church!', '<current welcome HTML with {{firstName}} etc>', ARRAY['firstName', 'prayerRequests']),
  ('volunteer-invite', 'Volunteer Invitation', 'You''ve been invited to join {{teamName}} at House of Transformation Church', '<current invite HTML with {{teamName}}, {{confirmUrl}}>', ARRAY['teamName', 'confirmUrl']),
  ('birthday', 'Birthday Greeting', '{{birthdayEmoji}} Happy Birthday, {{firstName}}!', '<current birthday HTML with {{firstName}}>', ARRAY['firstName']);
```

### New Files
- `src/components/admin/EmailTemplates.tsx` -- list, edit, and preview templates

### Modified Files
- `src/components/admin/CommunicationsPanel.tsx` -- add a "Templates" tab alongside Composer and Log
- `supabase/functions/register-visitor/index.ts` -- load template by slug, replace placeholders
- `supabase/functions/invite-volunteer/index.ts` -- load template by slug, replace placeholders
- `supabase/functions/send-birthday-emails/index.ts` -- load template by slug, replace placeholders

---

## 3. Admin-Only Directory Deletion

Currently the Church Directory table is read-only. Add a delete button visible only to admins.

### Approach
- Add a **Delete** button (trash icon) in each row of the directory table, visible only when the current user is an admin
- Deleting an attendee-based entry removes the record from the `attendees` table
- Deleting a volunteer-only entry (profile with no attendee link) shows a message that the volunteer must be removed via team management (since deleting a profile would orphan their auth account)
- Add an `AlertDialog` confirmation before deletion
- Pass `isAdmin` from `useAuth()` into `ChurchDirectory` or use it directly

### Database Change
- Add a DELETE RLS policy on `attendees` for admins:
```sql
CREATE POLICY "Admins can delete attendees"
  ON public.attendees FOR DELETE
  USING (has_role(auth.uid(), 'admin'));
```

### Modified Files
- `src/components/admin/ChurchDirectory.tsx` -- add delete button, confirmation dialog, and delete mutation

---

## Technical Summary

| Task | Files Changed/Created |
|------|----------------------|
| Address autocomplete | New: `address-autocomplete/index.ts`, `AddressAutocomplete.tsx`. Modified: `Welcome.tsx`, `config.toml` |
| Email templates | New migration, new: `EmailTemplates.tsx`. Modified: `CommunicationsPanel.tsx`, `register-visitor`, `invite-volunteer`, `send-birthday-emails` |
| Directory deletion | New migration (DELETE policy). Modified: `ChurchDirectory.tsx` |

## Implementation Order

1. Request Google Maps API key secret
2. Database migrations (email_templates table + seed data, attendees DELETE policy)
3. Address autocomplete edge function and component
4. Update Welcome.tsx with autocomplete
5. Email templates management UI
6. Update edge functions to use database templates
7. Directory delete functionality


# Plan: SMS bulk send, Contact Groups, and day-after Welcome text

Three coordinated upgrades to the messaging system:

## 1. Upgrade the Text (SMS) composer — searchable, filterable, multi-recipient

In `src/components/admin/SmsComposer.tsx`:
- Replace the single phone field with a **Recipients** picker:
  - Search box (name / phone / email) across `attendees` + `profiles`
  - Filter chips: SMS opt-in (default ON), has phone, tag, team membership, interest-meeting date, role (member/visitor/staff)
  - Multi-select with running count + "Select all matching"
  - Selected chips listed below with remove buttons
- Add an "Insert from Group" button that loads a saved group (see §2)
- Sending behavior:
  - Loops recipients on the client, calls `send-sms` once per number with a small concurrency limit (e.g. 5) and per-recipient progress + error log
  - Personalization tokens in the body: `{{first_name}}`, `{{last_name}}` — rendered per recipient before send
  - Duplicate guard runs per recipient (existing `findRecentDuplicate`)
- Keep single-send mode by default; "Add another" toggles multi-recipient mode so existing flows don't change

No edge-function change needed — `send-sms` already enforces consent, do-not-contact, dedupe-friendly logging.

## 2. Reusable Contact Groups (used by both Email and SMS)

### Data model (migration)
- `contact_groups` — id, name, description, kind (`static` | `smart`), filter (jsonb, for smart groups), created_by, timestamps
- `contact_group_members` — group_id, member_type (`attendee` | `profile`), member_id (uuid) — for static groups only
- RLS: admins & first-impressions members can read/manage

### UI: new tab in Communications panel
- "Groups" tab in `CommunicationsPanel.tsx` → new `ContactGroups.tsx`
  - List groups with member counts and "Send Email" / "Send Text" quick actions
  - Create/edit dialog:
    - Static: search + multi-select people (reuses recipient picker from §1)
    - Smart: rule builder — tags (any/all), SMS opt-in, has phone/email, is_member, is_staff, team membership, interest-meeting date, do-not-contact off
  - Preview pane shows live count + first 20 matches

### Wiring
- `EmailComposer` and `SmsComposer` both get a "Load Group" action that resolves a group → recipient list at send time (smart groups re-evaluate at click)

## 3. Day-after Welcome SMS

### Editable template
- Insert a row in `email_templates` is not the right fit (it's HTML). Add a tiny SMS template store:
  - Add `sms_templates` table: slug, name, body, placeholders, timestamps (RLS: admins manage, FI read)
  - Seed: `welcome_followup_sms` with default body using `{{first_name}}`
- Add an "SMS Templates" sub-section under the existing Templates tab to edit it

### Scheduling
- New edge function `send-welcome-followup-sms` (verify_jwt false, called by cron):
  - Finds `attendees` where:
    - `sms_opt_in = true` AND `phone IS NOT NULL`
    - `created_at` between 22h and 26h ago (so a daily run catches yesterday's welcome submissions)
    - Not already tagged `welcome_followup_sms_sent`
    - `do_not_contact = false`
  - For each, render template and call `send-sms` (override_consent false — relies on real opt-in)
  - Tag attendee `welcome_followup_sms_sent` after success
- Schedule via `pg_cron` + `pg_net` to run daily at 10:00 local (cron expr to be confirmed with your timezone)

### Admin visibility
- Surface last-run status (sent/skipped/failed counts) in the Communications → SMS Log tab via a small status card reading from `sms_log` filtered by today's tag

---

## Technical notes
- All SMS still flows through `supabase/functions/send-sms` → consent, footer, do-not-contact, and `sms_log` already covered.
- Smart-group filters are evaluated server-side via a Supabase RPC `resolve_contact_group(group_id)` returning a unified recipient set (name, phone, email, opt_in flags) so Email and SMS both use the same source of truth.
- New memory entries to add after build: `mem://features/communications/contact-groups`, `mem://features/communications/welcome-followup-sms`.

## Build order
1. Migration: `contact_groups`, `contact_group_members`, `sms_templates`, seed welcome template
2. Recipient picker component (shared by composer + groups dialog)
3. Upgrade `SmsComposer` to multi-recipient
4. Groups UI + RPC `resolve_contact_group`
5. Wire "Load Group" in Email + SMS composers
6. `send-welcome-followup-sms` edge function + pg_cron schedule
7. SMS templates editor in Templates tab
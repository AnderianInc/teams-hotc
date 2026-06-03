## Goals

1. Directory status must reflect the First Impressions pipeline (not a generic "Visitor" fallback).
2. Add a clear way to create / edit automated outreach sequences for interest meetings (per meeting or globally).
3. Let admins fully manage an interest meeting's attendee list — remove people, mark as no-show / attended, in addition to moving them.

---

## 1. Pipeline status is the source of truth in Directory

**Current behavior**
- `ChurchDirectory` derives status purely from `attendees.is_member`, `profiles.is_staff`, and team membership. Anyone who isn't a member/staff/volunteer is labeled **Visitor**, even if their pipeline stage is `interested` or `invited` (i.e. they haven't actually visited).
- The pipeline stage lives on `follow_ups.prospect_pipeline_stage` (`interested → invited → visited → connected → member`).

**Fix**
- In `fetchDirectory`, also load `follow_ups` rows with `type='outreach'` and `prospect_pipeline_stage` not null, keyed by `attendee_id` (latest one wins).
- Add `pipelineStage` to `DirectoryEntry`.
- Status badge logic for non-member/non-staff/non-volunteer rows:
  - `interested` → **Interested** (purple)
  - `invited` → **Invited** (blue)
  - `visited` → **Visitor** (current behavior)
  - `connected` → **Connected**
  - no pipeline row + no `first_visit_date` → **Contact** (neutral) instead of misleading "Visitor"
  - has `first_visit_date` but no pipeline row → **Visitor**
- Update the "Visitors" filter chip to mean `pipelineStage = 'visited'` OR `first_visit_date` set, and add **Interested** / **Invited** chips.

---

## 2. Automation builder for interest meetings

**Current behavior**
- `outreach_sequences` rows are keyed by `source` ('prayer' | 'visit' | 'interest'). The "interest" source has a fixed set of reminders anchored to `event_date`.
- `ExternalSourcesPanel` only lets admins toggle/edit `offset_days` and `active` per row. No add/delete, no per-meeting variations, no UI inside Interest Meetings.

**Fix — add a dedicated "Automations" panel inside Interest Meetings**
- New section `InterestMeetingAutomations` at the top of `InterestMeetings.tsx` (collapsible card).
- Lists existing `outreach_sequences` where `source='interest'` with full CRUD:
  - **Add step**: dialog with fields `description`, `channel` (email/sms), `audience` (requester/team), `template_slug` (dropdown of `email_templates`), `anchor` (received/event), `offset_days`, `requires_approval`, `active`, `step_order`.
  - **Edit**: same dialog prefilled.
  - **Delete**: confirm + remove (skip if any runs already reference it — set inactive instead).
  - **Reorder**: up/down arrows on `step_order`.
- Reuse the same component on the External Sources panel so admins can manage from either place.

This gives a clear "create a new automation for an interest meeting" path without needing to invent a per-meeting override schema (all interest meetings share the same sequence, which matches how the dispatcher already works).

---

## 3. Edit attendee list in Interest Meetings

**Current behavior**
- Each row under a meeting is read-only; only group-level "Move attendees" works.

**Fix**
- Add a row-level three-dots menu (matches existing directory pattern) with:
  - **Move to another date** → opens the existing reschedule dialog scoped to that single record.
  - **Move to Unscheduled**.
  - **Remove from meeting** → sets `external_records.status = 'ignored'` and skips outstanding runs via existing `cancelOutreachForRecord` helper in `src/lib/outreachPipeline.ts` (already handles run cleanup + ignored status).
  - **Open attendee** → navigate to `/admin/directory/{attendee_id}` if linked.
- Add an inline **Add attendee** button per meeting card: search existing attendees (or paste name/email/phone) and insert a synthetic `external_records` row (`source='interest'`, `status='created'`, `event_date=<meeting>`, `external_id='manual:<uuid>'`, `payload={name,email,phone}`, `attendee_id=<picked>`).

---

## Technical notes

- All work is frontend + existing tables; no schema changes required.
  - `outreach_sequences` already supports all needed fields.
  - `external_records.status='ignored'` is the existing "stop pipeline" signal.
  - `follow_ups.prospect_pipeline_stage` is already populated by existing triggers.
- Files touched:
  - `src/components/admin/ChurchDirectory.tsx` (pipeline-aware status, new chips)
  - `src/components/admin/InterestMeetings.tsx` (row actions, add-attendee, automations section)
  - `src/components/admin/InterestMeetingAutomations.tsx` (new)
  - `src/components/admin/ExternalSourcesPanel.tsx` (reuse the new automations editor — optional small refactor)
- Help docs `admin-sources.md` and `fi-pipeline.md` updated to describe new directory labels + automation editor.

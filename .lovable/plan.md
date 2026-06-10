## Bulk delete in Church Directory

Add multi-select with a bulk delete action for individuals in the Church Directory table. Families are excluded (they keep using the existing per-row family delete dialog).

### UI changes (`src/components/admin/ChurchDirectory.tsx`)
- Add a checkbox column (admin-only) as the first column.
  - Header checkbox toggles select-all for currently filtered individual rows (family rows show no checkbox).
  - Row checkbox toggles a single individual; clicking it stops row navigation.
- Track `selectedIds: Set<string>` in component state, keyed by attendee/profile id.
- When `selectedIds.size > 0`, show a sticky action bar above the table:
  - "{N} selected" + "Clear" + destructive "Delete selected" button.
- "Delete selected" opens a confirmation `AlertDialog` requiring the admin to type `DELETE` to enable the confirm button (guards against accidents).
- After delete completes: clear selection, refresh directory, toast summary "Removed X people (Y failed)".

### Delete logic
- Extract the per-entry cleanup currently inside `DirectoryDeleteButton.handleDelete` into a reusable helper `deleteDirectoryEntry(entry)` in `src/lib/directoryDelete.ts` so the bulk path and the existing per-row dialog both use the same flow:
  1. If `isVolunteerOnly` → remove `team_members` then `profiles` by `user_id`.
  2. Else → `cancelOutreachForAttendee(id)`, find linked profile, remove its `team_members` + `profiles`, then delete `attendees` row.
- Family rows are skipped in bulk delete; helper returns early if `source === 'family'`.
- Process sequentially with a small concurrency (e.g. 4 at a time) to avoid hammering the DB, collecting per-id errors for the summary toast.

### Access control
- Checkbox column and bulk bar are gated on `isAdmin` (same gate already used for the per-row actions column).

### Out of scope
- Bulk delete for families.
- Bulk edits, bulk tagging, exports.

### Files touched
- `src/components/admin/ChurchDirectory.tsx` — add checkboxes, selection state, bulk bar, confirm dialog.
- `src/lib/directoryDelete.ts` — new shared delete helper.
- `src/components/admin/DirectoryDeleteButton.tsx` — refactor to call the shared helper (no behavior change).

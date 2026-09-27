# Songs as a proper list, with leader and key

Social media posting is set aside for now.

## What changes for you
- In the run sheet, a song slot now shows its songs as a numbered list, one song per line. Right now they're squeezed onto one cut-off line separated by dots.
- Each song line shows **who is leading** and the **key**. For example:
  `1. Goodness of God — led by Jane Doe · Key: A`
- Editing a song gives you three fields: title, leader, and key.
  - **Leader** is a search box that finds people in the directory. You can also type any name.
  - **Key** is a short dropdown (C, C#, D ... B, plus minor keys). You can also type your own.
- Service templates use the same editor, so you can set a default leader and key. These carry over when you create a run sheet from the template.
- The shared order-of-service page and the homepage tile show the same list.

## Technical details
- Add a `song_items jsonb not null default '[]'` column to both `service_template_slots` and `service_instance_slots`. Each item looks like `{title, leader_name, leader_profile_id?, key}`.
- Backfill it from the existing `songs` text[] column in the same step. Keep `songs` in sync (titles only) so nothing that reads it breaks.
- Add a new `update_service_slot_song_items(_slot_id, _items jsonb)` function that does the same permission check as `update_service_slot_songs` and writes both columns.
- Build a shared `SongListEditor` (draft state, stable index keys, commit on close/blur, plus the existing pendingRef protection) and a `SongListDisplay` (numbered list).
- Use them in `ServiceRunSheet.tsx`, `ServiceTemplateEditor.tsx` and `OrderOfServiceView.tsx`.
- `generateServiceFromTemplate` copies `song_items` into the new run sheet.
- Leader search reuses the existing directory search from `MemberPicker`.

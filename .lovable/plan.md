# Social Media team, smoother slot assignment, Google Drive photo uploads

## 1. Add "Social Media" team
- Create a Volunteer-type team named "Social Media" (slug `social-media`). It then shows up in Teams, Master Schedule, Order of Service and My Teams.

## 2. Assigning people follows the slot's team
- Right now the Assign popup in the Order of Service remembers the team from when the page first loaded. If you change a slot's team, you have to pick the team again in the popup.
- Fix: the Assign popup always opens on the slot's current team and shows that team's members right away. You can still switch to "Search directory" or pick another team.
- If a slot has no team, the popup opens on directory search.
- Choosing a team inside the popup while the slot has no team will also set that as the slot's team, so you only pick it once.

## 3. Social Media photo uploads to Google Drive
- New "Photos" tab on the Social Media team dashboard (visible to that team's members and admins).
- Upload several photos at once (drag-drop or pick from phone camera roll), with an optional service/event date and caption.
- Files go into one church Google Drive folder, organised into subfolders by date (e.g. `2026-09-27 Sunday Service`).
- Gallery shows recent uploads with thumbnails, who uploaded them, and an "Open in Drive" link.
- Nothing is stored in Lovable Cloud storage; only a small record (file name, Drive link, uploader, date) is kept so the gallery loads quickly.

### Setup needed from you
- Connect the church's Google Drive account (a connect card will appear).
- Tell me which Drive folder to use, or I create a "HOTC Social Media" folder.

## Technical details
- Team: insert into `teams` via SQL.
- `SlotAssignPopover`: sync `teamId`/`mode` from `slot.team_id` via `useEffect` when popover opens or slot team changes; default mode `everyone` when no team; when slot has no team and user picks one, call `updateSlot` to set `team_id`.
- Google Drive connector (App connector, church account) linked to the project.
- New edge function `social-media-upload`: verifies user is admin or Social Media member, finds/creates dated subfolder, multipart-uploads file to Drive, returns file id/links. Second action lists/deletes files.
- New table `social_media_photos` (drive_file_id, name, web_view_link, thumbnail_link, folder_date, caption, uploaded_by, created_at) with GRANTs + RLS limited to admins and Social Media members.
- Thumbnails proxied through the edge function (Drive thumbnails need auth).
- Large files: limit ~25 MB per photo per request.

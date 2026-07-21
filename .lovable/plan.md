## Access control for Kids Check-In / Register

### Current state (verified)

Access to Register and Check-In is already limited to Children's Ministry team members plus admins, at two layers:

- **Route guard** — `/team/childrens-ministry` in `TeamDashboard.tsx` redirects to `/` unless the user has a membership in that team or is an admin.
- **Database RLS** — `children`, `families`, and `check_ins` all use `is_kids_ministry_member(auth.uid()) OR has_role(auth.uid(), 'admin')` for read/insert/update. Even if a user reached the UI, the database would reject the write.

Since you confirmed admins should keep access, no policy or route changes are needed.

### Small UX improvement to add

Right now a non-Kids, non-admin user who follows a bookmark or shared link to `/team/childrens-ministry` is silently redirected to the home page with no explanation. That's confusing.

Change `TeamDashboard.tsx` so that instead of `<Navigate to="/" replace />` for a denied user, it renders a short "You don't have access to this team. Ask an admin to add you to the Children's Ministry team." panel with a Home button.

### Files touched

- `src/pages/TeamDashboard.tsx` — replace the silent redirect with an inline "access denied" panel (applies to all team dashboards, not just Kids).

### Not changed

- No database migration.
- No RLS changes.
- No changes to Bridge / printer setup.

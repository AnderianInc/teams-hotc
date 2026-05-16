# Security & access (plain English)

The app uses row-level security on every table — the database itself enforces who can read or write what, not just the UI.

- **Members** can only see and edit their own data plus the teams they belong to.
- **Team leads** can manage their team's members and roster.
- **Staff** team members can see cross-ministry data (e.g. directory).
- **Admins** can do everything.

Sensitive features (deletion requests, role assignment, external source config) are admin-only. Roles live in their own `user_roles` table, never on the profile, to prevent privilege escalation.

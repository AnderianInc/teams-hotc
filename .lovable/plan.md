

# Plan: Fix Redirect URLs and Admin Team Visibility

## 1. Set SITE_URL to `https://teams.hotc.life`

The invite emails and password reset links currently redirect to the Lovable preview URL. Two changes are needed:

### Edge Function (`invite-volunteer/index.ts`)
- Change the fallback URL on lines 83 and 157 from `https://id-preview--ec8a92d7-c2a0-437b-b7a0-bd32f8d55569.lovable.app` to `https://teams.hotc.life`
- This is used for the magic link redirect in invitation emails

### Auth config (`supabase/config.toml`)
- Add `site_url` and `redirect_urls` configuration so the authentication system uses `teams.hotc.life` for all email links (confirmation, password reset, etc.)

### Login page (`Login.tsx`)
- The password reset already uses `window.location.origin` which will work correctly once the app is published at `teams.hotc.life`, so no change needed there

### Custom Domains
- You will need to connect `teams.hotc.life` as a custom domain in Project Settings > Domains
- Add DNS records: A record for `teams` subdomain pointing to `185.158.133.1`, plus the TXT verification record
- Also connect `houseoftransformationchurch.com` and `houseoftransformation.church` if desired (these can redirect to the primary `teams.hotc.life` domain)

---

## 2. Admins See All Teams Under "My Teams"

Currently `useMyTeams()` only queries `team_members` for the logged-in user's rows. Admins who aren't explicitly added to every team see nothing.

### Update `useMyTeams()` in `src/hooks/useTeams.tsx`
- Accept `isAdmin` from `useAuth()`
- If `isAdmin` is true, fetch ALL teams from the `teams` table and return them as virtual memberships with role `"admin"`
- If not admin, keep the existing `team_members` query

This single change automatically fixes both:
- **Dashboard** (`Dashboard.tsx`) -- admin sees all team cards
- **Sidebar** (`AppSidebar.tsx`) -- admin sees all teams in the sidebar nav

No changes needed to Dashboard, AppSidebar, or TeamDashboard since they already consume `useMyTeams()` and admins are already allowed access in `TeamDashboard.tsx` via the `isAdmin` check.

---

## Technical Details

| File | Change |
|------|--------|
| `supabase/functions/invite-volunteer/index.ts` | Replace preview URL with `https://teams.hotc.life` (lines 83, 157) |
| `supabase/config.toml` | Add auth site_url and redirect_urls config |
| `src/hooks/useTeams.tsx` | Update `useMyTeams()` to return all teams for admins |

No database migrations needed.


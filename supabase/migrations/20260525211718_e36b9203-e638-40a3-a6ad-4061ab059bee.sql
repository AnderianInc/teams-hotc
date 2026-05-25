
-- 1. app_settings: restrict SELECT
DROP POLICY IF EXISTS "Authenticated read app settings" ON public.app_settings;

CREATE POLICY "Read non-sensitive app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  key IN ('church_timezone')
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. team_members: prevent team leads from creating other team_leads
DROP POLICY IF EXISTS "Team leads can insert team memberships" ON public.team_members;

CREATE POLICY "Team leads can insert team memberships"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_team_lead(auth.uid(), team_id)
  AND (role <> 'team_lead' OR public.has_role(auth.uid(), 'admin'::app_role))
);

-- Also prevent UPDATE escalation to team_lead by team leads
DROP POLICY IF EXISTS "Team leads can update team members" ON public.team_members;

CREATE POLICY "Team leads can update team members"
ON public.team_members
FOR UPDATE
TO authenticated
USING (
  public.is_team_lead(auth.uid(), team_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (
    public.is_team_lead(auth.uid(), team_id)
    AND (role <> 'team_lead')
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Drop overly-broad public listing policy on avatars bucket.
-- Public bucket URLs (getPublicUrl) continue to work via the public CDN endpoint.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;

-- 4. Realtime: default-deny RLS on realtime.messages so private channels
-- can't be subscribed to by arbitrary users. Public postgres_changes
-- subscriptions are unaffected (they enforce table RLS instead).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to own topic" ON realtime.messages;
CREATE POLICY "Users can subscribe to own topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('user-' || auth.uid()::text)
);

DROP POLICY IF EXISTS "Users can publish to own topic" ON realtime.messages;
CREATE POLICY "Users can publish to own topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = ('user-' || auth.uid()::text)
);

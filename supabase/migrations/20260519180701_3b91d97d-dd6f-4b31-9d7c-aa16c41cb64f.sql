
-- Contact groups (reusable across Email + SMS)
CREATE TABLE public.contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'static' CHECK (kind IN ('static','smart')),
  filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contact groups"
  ON public.contact_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "FI can read contact groups"
  ON public.contact_groups FOR SELECT TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "FI can insert contact groups"
  ON public.contact_groups FOR INSERT TO authenticated
  WITH CHECK (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "FI can update contact groups"
  ON public.contact_groups FOR UPDATE TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_contact_groups_updated_at
  BEFORE UPDATE ON public.contact_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Static group membership
CREATE TABLE public.contact_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('attendee','profile')),
  member_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, member_type, member_id)
);
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cgm_group ON public.contact_group_members(group_id);

CREATE POLICY "Admins manage group members"
  ON public.contact_group_members FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "FI can read group members"
  ON public.contact_group_members FOR SELECT TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "FI can insert group members"
  ON public.contact_group_members FOR INSERT TO authenticated
  WITH CHECK (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "FI can delete group members"
  ON public.contact_group_members FOR DELETE TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

-- SMS templates
CREATE TABLE public.sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  placeholders TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sms templates"
  ON public.sms_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "FI can read sms templates"
  ON public.sms_templates FOR SELECT TO authenticated
  USING (is_first_impressions_member(auth.uid()) OR has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sms_templates (slug, name, body, placeholders) VALUES
  ('welcome_followup_sms',
   'Welcome day-after text',
   'Hi {{first_name}}, it''s the team at House of Transformation Church. So glad you connected with us yesterday! If there''s anything we can pray for or help you with, just text us back. We''d love to see you Sunday. — HOTC',
   ARRAY['first_name','last_name']);

-- RPC: resolve a contact group into a unified recipient list
CREATE OR REPLACE FUNCTION public.resolve_contact_group(_group_id UUID)
RETURNS TABLE (
  source TEXT,
  source_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  sms_opt_in BOOLEAN,
  do_not_contact BOOLEAN,
  tags TEXT[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g RECORD;
  f JSONB;
  tag_any TEXT[];
  tag_all TEXT[];
  require_sms_optin BOOLEAN;
  require_phone BOOLEAN;
  require_email BOOLEAN;
  is_member_only BOOLEAN;
  is_staff_only BOOLEAN;
  exclude_dnc BOOLEAN;
BEGIN
  SELECT * INTO g FROM public.contact_groups WHERE id = _group_id;
  IF g IS NULL THEN RETURN; END IF;

  IF g.kind = 'static' THEN
    RETURN QUERY
      SELECT 'attendee'::text, a.id, a.first_name, a.last_name, a.email, a.phone, a.sms_opt_in, a.do_not_contact, a.tags
      FROM public.contact_group_members m
      JOIN public.attendees a ON a.id = m.member_id
      WHERE m.group_id = _group_id AND m.member_type = 'attendee'
      UNION ALL
      SELECT 'profile'::text, p.id, split_part(p.full_name,' ',1),
             NULLIF(regexp_replace(p.full_name, '^\S+\s*', ''), ''),
             p.email, p.phone, p.sms_opt_in, p.do_not_contact, ARRAY[]::text[]
      FROM public.contact_group_members m
      JOIN public.profiles p ON p.id = m.member_id
      WHERE m.group_id = _group_id AND m.member_type = 'profile';
    RETURN;
  END IF;

  -- Smart group filter shape:
  -- { tagsAny: [], tagsAll: [], requireSmsOptIn: bool, requirePhone: bool,
  --   requireEmail: bool, isMember: bool, isStaff: bool, excludeDoNotContact: bool }
  f := COALESCE(g.filter, '{}'::jsonb);
  tag_any := COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(f->'tagsAny')), ARRAY[]::text[]);
  tag_all := COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(f->'tagsAll')), ARRAY[]::text[]);
  require_sms_optin := COALESCE((f->>'requireSmsOptIn')::boolean, false);
  require_phone := COALESCE((f->>'requirePhone')::boolean, false);
  require_email := COALESCE((f->>'requireEmail')::boolean, false);
  is_member_only := COALESCE((f->>'isMember')::boolean, false);
  is_staff_only := COALESCE((f->>'isStaff')::boolean, false);
  exclude_dnc := COALESCE((f->>'excludeDoNotContact')::boolean, true);

  RETURN QUERY
    SELECT 'attendee'::text, a.id, a.first_name, a.last_name, a.email, a.phone, a.sms_opt_in, a.do_not_contact, a.tags
    FROM public.attendees a
    WHERE (NOT exclude_dnc OR a.do_not_contact = false)
      AND (NOT require_sms_optin OR a.sms_opt_in = true)
      AND (NOT require_phone OR (a.phone IS NOT NULL AND a.phone <> ''))
      AND (NOT require_email OR (a.email IS NOT NULL AND a.email <> ''))
      AND (NOT is_member_only OR a.is_member = true)
      AND (array_length(tag_any,1) IS NULL OR a.tags && tag_any)
      AND (array_length(tag_all,1) IS NULL OR a.tags @> tag_all)
    UNION ALL
    SELECT 'profile'::text, p.id, split_part(p.full_name,' ',1),
           NULLIF(regexp_replace(p.full_name, '^\S+\s*', ''), ''),
           p.email, p.phone, p.sms_opt_in, p.do_not_contact, ARRAY[]::text[]
    FROM public.profiles p
    WHERE (NOT exclude_dnc OR p.do_not_contact = false)
      AND (NOT require_sms_optin OR p.sms_opt_in = true)
      AND (NOT require_phone OR (p.phone IS NOT NULL AND p.phone <> ''))
      AND (NOT require_email OR (p.email IS NOT NULL AND p.email <> ''))
      AND (NOT is_staff_only OR p.is_staff = true)
      AND array_length(tag_any,1) IS NULL  -- profiles have no tags column
      AND array_length(tag_all,1) IS NULL;
END;
$$;

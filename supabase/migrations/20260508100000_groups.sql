-- Small Groups (location-based) and Life Groups (life-need-based)

CREATE TABLE public.groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  group_type  TEXT        NOT NULL CHECK (group_type IN ('small_group', 'life_group')),
  -- small_group: where they meet geographically
  location    TEXT,
  -- life_group: what life stage / need they address
  category    TEXT,
  leader_id   UUID        REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  meeting_day  TEXT,
  meeting_time TIME,
  meeting_address TEXT,
  max_capacity INTEGER,
  is_open     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  attendee_id UUID        REFERENCES public.attendees(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'co_leader', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT group_member_unique UNIQUE (group_id, attendee_id)
);

ALTER TABLE public.groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_read"          ON public.groups        FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups_write"         ON public.groups        FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "group_members_read"   ON public.group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_members_write"  ON public.group_members FOR ALL    TO authenticated USING (true) WITH CHECK (true);

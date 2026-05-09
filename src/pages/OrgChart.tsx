import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, UserCircle2 } from "lucide-react";

type ProfileRow = {
  user_id: string;
  full_name: string;
  email: string;
  is_staff: boolean;
  staff_role_id: string | null;
  staff_title: string | null;
  reports_to_user_id: string | null;
  org_team_id: string | null;
};

type Team = { id: string; name: string };
type StaffRole = { id: string; name: string };

export default function OrgChart() {
  const { data: profiles = [] } = useQuery({
    queryKey: ["org-profiles-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, is_staff, staff_role_id, staff_title, reports_to_user_id, org_team_id")
        .order("full_name");
      if (error) throw error;
      return (data || []) as unknown as ProfileRow[];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["org-teams-public"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return (data || []) as Team[];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["staff-roles-public"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_roles" as any).select("id, name");
      if (error) throw error;
      return (data || []) as unknown as StaffRole[];
    },
  });

  const roleMap = new Map(roles.map((r) => [r.id, r.name]));
  const titleFor = (p: ProfileRow) => p.staff_title || (p.staff_role_id ? roleMap.get(p.staff_role_id) : null);

  const byTeam = new Map<string | null, ProfileRow[]>();
  byTeam.set(null, []);
  teams.forEach((t) => byTeam.set(t.id, []));
  profiles.forEach((p) => {
    const k = p.org_team_id || null;
    if (!byTeam.has(k)) byTeam.set(k, []);
    byTeam.get(k)!.push(p);
  });

  const renderTree = (deptId: string | null) => {
    const list = byTeam.get(deptId) || [];
    const roots = list.filter((p) => !p.reports_to_user_id || !list.some((x) => x.user_id === p.reports_to_user_id));
    const childrenOf = (id: string) => list.filter((p) => p.reports_to_user_id === id);

    const Node = ({ p }: { p: ProfileRow }) => {
      const kids = childrenOf(p.user_id);
      return (
        <div className="flex flex-col items-start gap-2">
          <div className="rounded-md border bg-card px-3 py-2 min-w-[200px] flex items-center gap-2 shadow-sm">
            <UserCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.full_name || p.email}</p>
              {titleFor(p) && <p className="text-xs text-muted-foreground truncate">{titleFor(p)}</p>}
            </div>
            {p.is_staff && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Staff</Badge>}
          </div>
          {kids.length > 0 && (
            <div className="ml-4 pl-4 border-l-2 border-muted flex flex-col gap-2">
              {kids.map((k) => <Node key={k.user_id} p={k} />)}
            </div>
          )}
        </div>
      );
    };

    if (roots.length === 0) return <p className="text-sm text-muted-foreground italic">No one assigned</p>;
    return (
      <div className="flex flex-wrap gap-3">
        {roots.map((p) => <Node key={p.user_id} p={p} />)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <Network className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Org Chart</h1>
          <p className="text-muted-foreground">How HOTC is organized</p>
        </div>
      </div>

      <div className="space-y-6">
        {teams.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle className="text-lg">{t.name}</CardTitle>
            </CardHeader>
            <CardContent>{renderTree(t.id)}</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">Unassigned</CardTitle>
          </CardHeader>
          <CardContent>{renderTree(null)}</CardContent>
        </Card>
      </div>
    </div>
  );
}

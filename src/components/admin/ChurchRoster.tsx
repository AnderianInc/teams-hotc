import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Calendar, TrendingUp } from "lucide-react";

export default function ChurchRoster() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-church-roster"],
    queryFn: async () => {
      // Get all volunteers (profiles with team memberships)
      const { data: teamMembers, error: tmErr } = await supabase
        .from("team_members")
        .select("user_id, role, team_id, teams(name, slug)");
      if (tmErr) throw tmErr;

      const userIds = [...new Set(teamMembers?.map((m) => m.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, phone, avatar_url")
        .in("user_id", userIds);

      // Get roster entries for scheduling stats
      const { data: rosterEntries } = await supabase
        .from("roster_entries")
        .select("user_id, scheduled_date")
        .gte("scheduled_date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

      // Build consolidated view
      const volunteerMap = new Map<string, any>();
      for (const tm of teamMembers || []) {
        if (!volunteerMap.has(tm.user_id)) {
          const profile = profiles?.find((p) => p.user_id === tm.user_id);
          volunteerMap.set(tm.user_id, {
            user_id: tm.user_id,
            full_name: profile?.full_name || "Unknown",
            email: profile?.email || "",
            phone: (profile as any)?.phone || "",
            teams: [],
            scheduledDates: 0,
            lastScheduled: null,
          });
        }
        const vol = volunteerMap.get(tm.user_id)!;
        vol.teams.push({ name: (tm.teams as any)?.name, role: tm.role });
      }

      for (const re of rosterEntries || []) {
        const vol = volunteerMap.get(re.user_id);
        if (vol) {
          vol.scheduledDates++;
          if (!vol.lastScheduled || re.scheduled_date > vol.lastScheduled) {
            vol.lastScheduled = re.scheduled_date;
          }
        }
      }

      return Array.from(volunteerMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const totalVolunteers = data?.length || 0;
  const activeVolunteers = data?.filter((v) => v.scheduledDates > 0).length || 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{totalVolunteers}</p>
              <p className="text-sm text-muted-foreground">Total Volunteers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{activeVolunteers}</p>
              <p className="text-sm text-muted-foreground">Scheduled (90 days)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{totalVolunteers > 0 ? Math.round((activeVolunteers / totalVolunteers) * 100) : 0}%</p>
              <p className="text-sm text-muted-foreground">Engagement Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Volunteer Roster</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Scheduled (90d)</TableHead>
                  <TableHead>Last Scheduled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((v) => (
                  <TableRow key={v.user_id}>
                    <TableCell className="font-medium">{v.full_name}</TableCell>
                    <TableCell className="text-sm">{v.email}</TableCell>
                    <TableCell className="text-sm">{v.phone || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {v.teams.map((t: any, i: number) => (
                          <Badge key={i} variant={t.role === "team_lead" ? "default" : "outline"} className="text-xs">
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{v.scheduledDates}</TableCell>
                    <TableCell className="text-sm">
                      {v.lastScheduled
                        ? new Date(v.lastScheduled + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

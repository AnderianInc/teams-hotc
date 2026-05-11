import { useAuth } from "@/hooks/useAuth";
import { useMyTeams } from "@/hooks/useTeams";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Baby, Music, Monitor, Coffee, HandHelping, Sparkles, LayoutDashboard,
  CalendarDays, ClipboardCheck, Users, ChevronRight, CheckCircle2, Clock,
} from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";

const teamIcons: Record<string, React.ElementType> = {
  "childrens-ministry": Baby,
  worship: Music,
  "media-production": Monitor,
  "java-team": Coffee,
  ushers: HandHelping,
  "first-impressions": Sparkles,
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { data: memberships, isLoading } = useMyTeams();
  const navigate = useNavigate();

  const userId = user?.id;
  const thisServiceDate = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

  // My upcoming roster assignments (next 30 days)
  const { data: upcomingAssignments } = useQuery({
    queryKey: ["my-upcoming-assignments", userId],
    queryFn: async () => {
      if (!userId) return [];
      const today = format(new Date(), "yyyy-MM-dd");
      const until = format(addDays(new Date(), 30), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("roster_entries")
        .select("id, scheduled_date, role_description, teams(name)")
        .eq("user_id", userId)
        .gte("scheduled_date", today)
        .lte("scheduled_date", until)
        .order("scheduled_date")
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  // My open follow-ups (assigned to me)
  const { data: myFollowUps } = useQuery({
    queryKey: ["my-follow-ups", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await (supabase.from as any)("follow_ups")
        .select("id, type, status, due_date, notes, attendees(first_name, last_name)")
        .eq("assigned_to", userId)
        .not("status", "in", '("connected","closed")')
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

  // My attendance status for this week
  const { data: myAttendance } = useQuery({
    queryKey: ["my-attendance-this-week", userId, thisServiceDate],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("weekly_attendance")
        .select("status")
        .eq("user_id", userId)
        .eq("service_date", thisServiceDate)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  // Team member counts (admin only)
  const { data: teamStats } = useQuery({
    queryKey: ["dashboard-team-stats"],
    queryFn: async () => {
      const { count } = await supabase.from("team_members").select("id", { count: "exact", head: true });
      return { totalVolunteers: count ?? 0 };
    },
    enabled: isAdmin,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? "You have admin access to all teams." : "Here's what's coming up for you."}
        </p>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold">{memberships?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">My Team{(memberships?.length ?? 0) !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{upcomingAssignments?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Upcoming shifts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold capitalize">
                  {myAttendance?.status ?? "Not recorded"}
                </p>
                <p className="text-xs text-muted-foreground">This week's attendance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming assignments */}
      {upcomingAssignments && upcomingAssignments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Upcoming Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {(upcomingAssignments as any[]).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="text-center min-w-[36px]">
                    <p className="text-xs text-muted-foreground">{format(new Date(a.scheduled_date + "T00:00:00"), "MMM")}</p>
                    <p className="text-lg font-bold leading-none">{format(new Date(a.scheduled_date + "T00:00:00"), "d")}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{(a.teams as any)?.name || "Team"}</p>
                    {a.role_description && (
                      <Badge variant="outline" className="text-xs mt-0.5">{a.role_description}</Badge>
                    )}
                  </div>
                </div>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* My follow-ups */}
      {myFollowUps && myFollowUps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> My Follow-Ups
              <Badge variant="secondary" className="ml-1">{myFollowUps.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {(myFollowUps as any[]).map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40"
                onClick={() => navigate("/team/first-impressions")}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {f.attendees?.first_name} {f.attendees?.last_name}
                  </p>
                  <div className="flex gap-1.5 items-center mt-0.5">
                    <Badge variant="outline" className="text-xs capitalize">{f.type ?? "outreach"}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{f.status}</Badge>
                    {f.due_date && (
                      <span className="text-xs text-muted-foreground">
                        Due {format(new Date(f.due_date + "T00:00:00"), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))}
            <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/team/first-impressions")}>
              Open First Impressions dashboard
            </Button>
          </CardContent>
        </Card>
      )}


      {!myAttendance && (
        <Card className="border-dashed">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Mark your attendance for this week</p>
              <p className="text-xs text-muted-foreground">Week of {format(startOfWeek(new Date(), { weekStartsOn: 0 }), "MMMM d, yyyy")}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/check-in")}>
              Check In
            </Button>
          </CardContent>
        </Card>
      )}

      {/* My teams */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">My Teams</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memberships?.map((m) => {
            const Icon = teamIcons[m.teams.slug] || LayoutDashboard;
            return (
              <Card
                key={m.team_id}
                className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5"
                onClick={() => navigate(`/team/${m.teams.slug}`)}
              >
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                    <Icon className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base leading-tight">{m.teams.name}</CardTitle>
                    <span className="inline-block mt-0.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                      {m.role.replace("_", " ")}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardHeader>
                {m.teams.description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{m.teams.description}</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
          {(!memberships || memberships.length === 0) && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                You haven't been assigned to any teams yet. Contact your admin.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Admin quick-stats */}
      {isAdmin && teamStats && (
        <Card className="bg-muted/30">
          <CardContent className="py-3 flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{teamStats.totalVolunteers}</span>
              <span className="text-muted-foreground">total volunteers across all teams</span>
            </div>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => navigate("/admin?tab=attendance")}>
              View Attendance
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

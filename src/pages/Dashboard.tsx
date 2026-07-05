import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeams } from "@/hooks/useTeams";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Baby, Music, Monitor, Coffee, HandHelping, Sparkles, LayoutDashboard,
  CalendarDays, ClipboardCheck, Users, ChevronRight, CheckCircle2, Clock, Check, X,
} from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import { useInstances } from "@/hooks/useOrderOfService";

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
  const queryClient = useQueryClient();
  const { data: allInstances = [] } = useInstances();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const upcomingServices = (allInstances as any[])
    .filter((i) => (isAdmin || i.status === "published") && i.service_date >= todayStr)
    .sort((a, b) => a.service_date.localeCompare(b.service_date))
    .slice(0, 3);
  const [declineFor, setDeclineFor] = useState<any>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [responding, setResponding] = useState<string | null>(null);

  const userId = user?.id;
  const thisServiceDate = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

  const respondToAssignment = async (
    assignment: any,
    status: "accepted" | "declined",
    reason?: string,
  ) => {
    setResponding(assignment.id);
    try {
      const { error } = await supabase
        .from("roster_entries")
        .update({
          response_status: status,
          decline_reason: status === "declined" ? (reason || null) : null,
          responded_at: new Date().toISOString(),
        })
        .eq("id", assignment.id);
      if (error) throw error;

      const { data: leads } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", assignment.team_id)
        .eq("role", "team_lead");
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const recipientIds = Array.from(new Set([
        ...(leads || []).map((l: any) => l.user_id),
        ...(admins || []).map((a: any) => a.user_id),
      ])).filter((id) => id !== userId);

      const teamName = (assignment.teams as any)?.name || "team";
      const dateStr = format(new Date(assignment.scheduled_date + "T00:00:00"), "EEE, MMM d");
      const memberName = user?.user_metadata?.full_name || user?.email || "A member";
      const verb = status === "accepted" ? "accepted" : "declined";
      const title = `${memberName} ${verb} a ${teamName} assignment`;
      const body = `${dateStr}${assignment.role_description ? ` · ${assignment.role_description}` : ""}${reason ? ` — Reason: ${reason}` : ""}`;

      await Promise.allSettled(
        recipientIds.map((rid) =>
          supabase.functions.invoke("notify", {
            body: {
              recipient_id: rid,
              type: status === "accepted" ? "roster_accepted" : "roster_declined",
              title,
              body,
              url: "/",
              high_priority: status === "declined",
            },
          })
        )
      );

      toast.success(status === "accepted" ? "Assignment accepted" : "Assignment declined — team lead notified");
      setDeclineFor(null);
      setDeclineReason("");
      queryClient.invalidateQueries({ queryKey: ["my-upcoming-assignments", userId] });
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      queryClient.invalidateQueries({ queryKey: ["roster-event-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["roster-assignments-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["roster-standalone-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["admin-church-roster"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to respond");
    } finally {
      setResponding(null);
    }
  };

  // My upcoming roster assignments (next 30 days) — includes both roster_entries and service slot assignments
  const { data: upcomingAssignments } = useQuery({
    queryKey: ["my-upcoming-assignments", userId],
    queryFn: async () => {
      if (!userId) return [];
      const today = format(new Date(), "yyyy-MM-dd");
      const until = format(addDays(new Date(), 30), "yyyy-MM-dd");

      const rosterQ = supabase
        .from("roster_entries")
        .select("id, scheduled_date, role_description, response_status, decline_reason, team_id, teams(name)")
        .eq("user_id", userId)
        .gte("scheduled_date", today)
        .lte("scheduled_date", until)
        .or("response_status.is.null,response_status.eq.pending")
        .order("scheduled_date")
        .limit(20);

      const profileQ = supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();

      const [{ data: rosterData, error: rosterErr }, { data: profileRow }] = await Promise.all([rosterQ, profileQ]);
      if (rosterErr) throw rosterErr;

      const roster = (rosterData || []).map((r: any) => ({
        ...r,
        source: "roster" as const,
      }));

      let slotAssignments: any[] = [];
      if (profileRow?.id) {
        const { data: slotData } = await supabase
          .from("service_slot_assignments")
          .select("id, role_label, roster_entry_id, service_instance_slots!inner(id, title, team_id, teams(name), service_instances!inner(id, title, service_date, status))")
          .eq("profile_id", profileRow.id);
        slotAssignments = (slotData || [])
          .filter((s: any) => {
            const inst = s.service_instance_slots?.service_instances;
            return inst && inst.service_date >= today && inst.service_date <= until;
          })
          // avoid double-counting: skip if it already has a matching roster_entry we already listed
          .filter((s: any) => !s.roster_entry_id || !roster.some((r: any) => r.id === s.roster_entry_id))
          .map((s: any) => {
            const slot = s.service_instance_slots;
            const inst = slot.service_instances;
            return {
              id: `slot-${s.id}`,
              scheduled_date: inst.service_date,
              role_description: s.role_label || slot.title,
              response_status: null,
              decline_reason: null,
              team_id: slot.team_id,
              teams: slot.teams,
              source: "slot" as const,
              instance_id: inst.id,
              instance_title: inst.title,
            };
          });
      }

      const combined = [...roster, ...slotAssignments].sort((a, b) =>
        a.scheduled_date.localeCompare(b.scheduled_date),
      );
      return combined.slice(0, 10);
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

        <Card>
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

        <Card
          className={upcomingServices.length > 0 ? "cursor-pointer hover:bg-muted/40 transition-colors" : ""}
          onClick={() => {
            if (upcomingServices.length === 0) return;
            const next = upcomingServices[0];
            navigate(`${isAdmin ? "/admin" : ""}/order-of-service/${next.id}`);
          }}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-purple-500 shrink-0" />
              <div className="min-w-0">
                {upcomingServices.length > 0 ? (
                  <>
                    <p className="text-sm font-semibold truncate">
                      {format(new Date(upcomingServices[0].service_date + "T00:00:00"), "EEE, MMM d")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Next order of service
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold">None</p>
                    <p className="text-xs text-muted-foreground">Order of service</p>
                  </>
                )}
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
              <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 gap-2 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-center min-w-[36px]">
                    <p className="text-xs text-muted-foreground">{format(new Date(a.scheduled_date + "T00:00:00"), "MMM")}</p>
                    <p className="text-lg font-bold leading-none">{format(new Date(a.scheduled_date + "T00:00:00"), "d")}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{(a.teams as any)?.name || "Team"}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {a.role_description && (
                        <Badge variant="outline" className="text-xs">{a.role_description}</Badge>
                      )}
                      {a.response_status === "accepted" && (
                        <Badge className="text-xs bg-green-600 hover:bg-green-600">Accepted</Badge>
                      )}
                      {a.response_status === "declined" && (
                        <Badge variant="destructive" className="text-xs">Declined</Badge>
                      )}
                    </div>
                    {a.response_status === "declined" && a.decline_reason && (
                      <p className="text-xs text-muted-foreground italic mt-0.5">"{a.decline_reason}"</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  {a.response_status !== "accepted" && (
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs"
                      disabled={responding === a.id}
                      onClick={() => respondToAssignment(a, "accepted")}
                    >
                      <Check className="h-3 w-3 mr-1" /> Accept
                    </Button>
                  )}
                  {a.response_status !== "declined" && (
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                      disabled={responding === a.id}
                      onClick={() => { setDeclineFor(a); setDeclineReason(""); }}
                    >
                      <X className="h-3 w-3 mr-1" /> Decline
                    </Button>
                  )}
                </div>
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
      <Dialog open={!!declineFor} onOpenChange={(o) => { if (!o) { setDeclineFor(null); setDeclineReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline assignment</DialogTitle>
          </DialogHeader>
          {declineFor && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 bg-muted/30 text-sm">
                <p className="font-medium">{(declineFor.teams as any)?.name}</p>
                <p className="text-muted-foreground text-xs">
                  {format(new Date(declineFor.scheduled_date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
                  {declineFor.role_description ? ` · ${declineFor.role_description}` : ""}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Reason (shared with team lead)</label>
                <Textarea
                  placeholder="e.g. Out of town, Illness, Family commitment..."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!declineReason.trim() || responding === declineFor?.id}
              onClick={() => respondToAssignment(declineFor, "declined", declineReason.trim())}
            >
              {responding === declineFor?.id ? "Sending..." : "Decline assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

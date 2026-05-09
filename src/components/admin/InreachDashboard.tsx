import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Heart, AlertTriangle, TrendingDown, UserCheck, Search, Plus, CalendarDays, BellRing } from "lucide-react";
import { format, startOfWeek } from "date-fns";
import AutoTriggerSettings from "./AutoTriggerSettings";

type EngagementBand = "active" | "drifting" | "at_risk" | "inactive";

const bandConfig: Record<EngagementBand, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: "Active", color: "bg-success/10 text-success border-success/30", icon: UserCheck },
  drifting: { label: "Drifting", color: "bg-warning/10 text-warning border-warning/30", icon: TrendingDown },
  at_risk: { label: "At Risk", color: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 border-orange-300", icon: AlertTriangle },
  inactive: { label: "Inactive", color: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle },
};

export default function InreachDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState<"all" | EngagementBand>("all");
  const [assignDialogMember, setAssignDialogMember] = useState<any>(null);
  const [detailMember, setDetailMember] = useState<any>(null);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const { data: engagement = [], isLoading } = useQuery({
    queryKey: ["member-engagement"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("member_engagement")
        .select("*")
        .order("days_since_last_attendance", { ascending: false, nullsFirst: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const thisServiceDate = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

  const { data: attendanceFill } = useQuery({
    queryKey: ["attendance-fill-check", thisServiceDate],
    queryFn: async () => {
      const [attRes, volRes] = await Promise.all([
        supabase.from("weekly_attendance").select("id", { count: "exact", head: true }).eq("service_date", thisServiceDate),
        supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      ]);
      return { filled: attRes.count ?? 0, total: volRes.count ?? 0 };
    },
  });

  const attendanceUnfilled =
    attendanceFill !== undefined &&
    attendanceFill.total > 0 &&
    attendanceFill.filled < Math.ceil(attendanceFill.total * 0.5);

  const { data: volunteers } = useQuery({
    queryKey: ["volunteers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const createInreachFollowUp = useMutation({
    mutationFn: async ({ memberId, attendeeId, memberName }: { memberId?: string | null; attendeeId?: string | null; memberName: string }) => {
      // Find or create an attendee record for this member
      let resolvedAttendeeId: string | null = attendeeId ?? null;

      if (!resolvedAttendeeId && memberId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name, attendee_id")
          .eq("user_id", memberId)
          .single();

        if (!profile) throw new Error("Profile not found");
        resolvedAttendeeId = profile.attendee_id ?? null;

        // Check for existing attendee
        if (!resolvedAttendeeId && profile.email) {
          const { data: existing } = await supabase
            .from("attendees")
            .select("id")
            .eq("email", profile.email)
            .maybeSingle();
          resolvedAttendeeId = existing?.id ?? null;
        }

        // Create attendee entry if not found
        if (!resolvedAttendeeId) {
          const nameParts = (profile.full_name || memberName).split(" ");
          const { data: newAttendee, error: attErr } = await supabase.from("attendees").insert({
            first_name: nameParts[0] || memberName,
            last_name: nameParts.slice(1).join(" ") || "",
            email: profile.email,
            is_member: true,
          }).select("id").single();
          if (attErr) throw attErr;
          resolvedAttendeeId = newAttendee.id;
        }
      }

      if (!resolvedAttendeeId) throw new Error("Member record not found");

      const { error } = await supabase.from("follow_ups").insert({
        attendee_id: resolvedAttendeeId,
        type: "inreach",
        status: "pending",
        priority: "high",
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        notes: notes.trim() || `Inreach follow-up for ${memberName} — engagement check`,
        inreach_trigger: "manual",
      } as any);
      if (error) throw error;

      // Notify assignee
      if (assignedTo) {
        try {
          await supabase.functions.invoke("notify", {
            body: {
              recipient_id: assignedTo,
              type: "inreach_trigger",
              title: "Inreach follow-up assigned",
              body: `Please check in with ${memberName} — they may be drifting or inactive.`,
              url: "/admin?tab=inreach",
              high_priority: true,
            },
          });
        } catch (err) {
          console.error("Inreach notification failed:", err);
        }
      }
    },
    onSuccess: () => {
      toast.success("Inreach follow-up created");
      setAssignDialogMember(null);
      setDueDate(""); setNotes(""); setAssignedTo("");
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = engagement.filter((m: any) => {
    const matchSearch = !search || (m.full_name?.toLowerCase().includes(search.toLowerCase()));
    const matchBand = bandFilter === "all" || m.engagement_band === bandFilter;
    return matchSearch && matchBand;
  });

  const summary = {
    active: engagement.filter((m: any) => m.engagement_band === "active").length,
    drifting: engagement.filter((m: any) => m.engagement_band === "drifting").length,
    at_risk: engagement.filter((m: any) => m.engagement_band === "at_risk").length,
    inactive: engagement.filter((m: any) => m.engagement_band === "inactive").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/30">
          <Heart className="h-4 w-4 text-rose-600" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold">Inreach — Member Engagement</h2>
          <p className="text-sm text-muted-foreground">Track member attendance and proactively care for those drifting away</p>
        </div>
      </div>

      {/* Attendance fill alert */}
      {attendanceUnfilled && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <BellRing className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning">Attendance not filled for this week</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only {attendanceFill!.filled} of {attendanceFill!.total} volunteers recorded for the week of {thisServiceDate}.
              Engagement scores depend on up-to-date attendance data.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs h-7 border-warning/40"
            onClick={() => window.location.assign("/admin?tab=attendance")}
          >
            Fill Attendance
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["active", "drifting", "at_risk", "inactive"] as EngagementBand[]).map((band) => {
          const cfg = bandConfig[band];
          const Icon = cfg.icon;
          return (
            <Card
              key={band}
              className={`cursor-pointer border ${bandFilter === band ? "ring-2 ring-primary" : ""}`}
              onClick={() => setBandFilter(bandFilter === band ? "all" : band)}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">{summary[band]}</span>
                </div>
                <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Engagement band legend */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Score bands:</span>{" "}
            <span className="text-success">Active</span> = attended within 2 weeks &nbsp;·&nbsp;
            <span className="text-warning">Drifting</span> = 2–5 weeks &nbsp;·&nbsp;
            <span className="text-orange-500">At Risk</span> = 5–9 weeks &nbsp;·&nbsp;
            <span className="text-destructive">Inactive</span> = 9+ weeks or never attended
          </p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={bandFilter} onValueChange={(v) => setBandFilter(v as any)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="All bands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bands</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="drifting">Drifting</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Members table */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading engagement data…</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead>Last Attended</TableHead>
              <TableHead>Attendance (90d)</TableHead>
              <TableHead>Shifts (90d)</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m: any) => {
              const band = (m.engagement_band || "inactive") as EngagementBand;
              const cfg = bandConfig[band];
              const Icon = cfg.icon;
              const needsAttention = band === "drifting" || band === "at_risk" || band === "inactive";
              return (
                <TableRow
                  key={m.engagement_id || m.user_id || m.attendee_id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetailMember(m)}
                >
                  <TableCell className="font-medium">{m.full_name || m.email || m.user_id}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`gap-1 text-xs ${cfg.color}`}>
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {m.last_attendance_date ? (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(m.last_attendance_date).toLocaleDateString()}
                        {m.days_since_last_attendance != null && (
                          <span className="text-xs">({m.days_since_last_attendance}d ago)</span>
                        )}
                      </span>
                    ) : (
                      <span className="italic">Never recorded</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{m.attendance_90d ?? 0}</TableCell>
                  <TableCell className="text-center">{m.roster_participations_90d ?? 0}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {needsAttention && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setAssignDialogMember(m)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Follow-Up
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No members match the current filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {/* Create inreach follow-up dialog */}
      <Dialog open={!!assignDialogMember} onOpenChange={(o) => !o && setAssignDialogMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Inreach Follow-Up</DialogTitle>
          </DialogHeader>
          {assignDialogMember && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createInreachFollowUp.mutate({
                  memberId: assignDialogMember.user_id,
                  attendeeId: assignDialogMember.attendee_id,
                  memberName: assignDialogMember.full_name,
                });
              }}
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                Creating an inreach follow-up for <span className="font-medium text-foreground">{assignDialogMember.full_name}</span>
                {" "}({bandConfig[assignDialogMember.engagement_band as EngagementBand]?.label}).
              </p>
              <div className="space-y-1">
                <Label>Assign To</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {volunteers?.filter((v: any) => v.user_id).map((v: any) => (
                      <SelectItem key={v.user_id} value={v.user_id}>{v.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Context for the person doing the follow-up…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={createInreachFollowUp.isPending}>
                {createInreachFollowUp.isPending ? "Creating…" : "Create Inreach Follow-Up"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <MemberDetailDialog
        member={detailMember}
        onClose={() => setDetailMember(null)}
        onCreateFollowUp={(m) => { setDetailMember(null); setAssignDialogMember(m); }}
      />

      <AutoTriggerSettings />
    </div>
  );
}

function MemberDetailDialog({
  member,
  onClose,
  onCreateFollowUp,
}: {
  member: any;
  onClose: () => void;
  onCreateFollowUp: (m: any) => void;
}) {
  const userId = member?.user_id;
  const attendeeId = member?.attendee_id;

  const { data: attendance } = useQuery({
    queryKey: ["member-attendance-detail", userId, attendeeId],
    enabled: !!member,
    queryFn: async () => {
      const since = format(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      let q = supabase
        .from("weekly_attendance")
        .select("service_date, status, is_self_reported")
        .gte("service_date", since)
        .order("service_date", { ascending: false });
      if (userId) q = q.eq("user_id", userId);
      else if (attendeeId) q = q.eq("attendee_id", attendeeId);
      else return [];
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: roster } = useQuery({
    queryKey: ["member-roster-detail", userId],
    enabled: !!member && !!userId,
    queryFn: async () => {
      const since = format(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("roster_entries")
        .select("scheduled_date, role_description, teams(name), roster_events(name)")
        .eq("user_id", userId)
        .gte("scheduled_date", since)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: followUps } = useQuery({
    queryKey: ["member-followups-detail", attendeeId],
    enabled: !!member && !!attendeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_ups")
        .select("type, status, priority, due_date, notes, created_at")
        .eq("attendee_id", attendeeId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!member) return null;
  const band = (member.engagement_band || "inactive") as EngagementBand;
  const cfg = bandConfig[band];

  const last30 = (attendance || []).filter((a: any) => {
    const days = (Date.now() - new Date(a.service_date).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }).length;
  const last90 = (attendance || []).filter((a: any) => {
    const days = (Date.now() - new Date(a.service_date).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 90;
  }).length;
  const last365 = (attendance || []).length;

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {member.full_name || member.email || "Member"}
            <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold">{last30}</p>
              <p className="text-xs text-muted-foreground">Attended (30d)</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold">{last90}</p>
              <p className="text-xs text-muted-foreground">Attended (90d)</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold">{last365}</p>
              <p className="text-xs text-muted-foreground">Attended (1y)</p>
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Last attended</p>
              <p className="font-medium">
                {member.last_attendance_date
                  ? `${new Date(member.last_attendance_date).toLocaleDateString()} (${member.days_since_last_attendance ?? "?"}d ago)`
                  : "Never recorded"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Roster shifts (90d)</p>
              <p className="font-medium">{member.roster_participations_90d ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3 col-span-2">
              <p className="text-muted-foreground text-xs">Contact</p>
              <p className="font-medium text-xs">{member.email || "—"} {member.phone ? `· ${member.phone}` : ""}</p>
            </div>
          </div>

          {/* Recent attendance */}
          <div>
            <p className="text-sm font-semibold mb-2">Recent Attendance</p>
            {(attendance || []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No attendance records.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(attendance || []).slice(0, 24).map((a: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {new Date(a.service_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {a.is_self_reported && <span className="ml-1 text-muted-foreground">·self</span>}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Roster shifts */}
          <div>
            <p className="text-sm font-semibold mb-2">Roster Shifts (180d)</p>
            {(roster || []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No recent shifts.</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(roster || []).map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-20">
                      {new Date(r.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <Badge variant="secondary" className="text-xs">{(r.teams as any)?.name || "—"}</Badge>
                    {r.role_description && <span className="text-muted-foreground">· {r.role_description}</span>}
                    {(r.roster_events as any)?.name && <span className="text-muted-foreground">· {(r.roster_events as any).name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Follow-ups */}
          <div>
            <p className="text-sm font-semibold mb-2">Follow-up History</p>
            {(followUps || []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No follow-ups recorded.</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(followUps || []).map((f: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">{f.type || "general"}</Badge>
                    <Badge variant={f.status === "completed" ? "default" : "secondary"} className="text-xs">{f.status}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString()}
                    </span>
                    {f.notes && <span className="truncate text-muted-foreground">— {f.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={() => onCreateFollowUp(member)}>
            <Plus className="h-4 w-4 mr-2" /> Create Inreach Follow-Up
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

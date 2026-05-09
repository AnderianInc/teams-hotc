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
                <TableRow key={m.user_id}>
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
                  <TableCell>
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

      <AutoTriggerSettings />
    </div>
  );
}

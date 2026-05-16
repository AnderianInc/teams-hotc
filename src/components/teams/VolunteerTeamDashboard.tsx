import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Calendar, CalendarDays, Users, Plus, Settings, CalendarPlus, ClipboardCheck, Check, X, Clock, AlertCircle, Pencil, Trash2, TrendingUp } from "lucide-react";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import TeamMemberManager from "@/components/teams/TeamMemberManager";
import TeamRoleTypeManager, { useTeamRoleTypes } from "@/components/teams/TeamRoleTypeManager";
import RosterEventManager from "@/components/teams/RosterEventManager";
import RosterCalendarView from "@/components/admin/RosterCalendarView";
import { assertUserAvailableForRoster, getRosterResponseLabel } from "@/lib/rosterAvailability";

const PRESET_PASTOR_DUTIES = [
  "Welcome",
  "Opening Prayer",
  "Worship Lead",
  "Announcements",
  "Offering",
  "Scripture Reading",
  "Teaching",
  "Sermon",
  "Altar Call",
  "Communion",
  "Closing",
  "Benediction",
];

interface VolunteerTeamDashboardProps {
  teamId: string;
  teamName: string;
  teamSlug: string;
  hideHeader?: boolean;
}

export default function VolunteerTeamDashboard({ teamId, teamName, teamSlug, hideHeader }: VolunteerTeamDashboardProps) {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{teamName}</h1>
          <p className="text-muted-foreground mt-1">Team dashboard</p>
        </div>
      )}

      <Tabs defaultValue="members" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <CalendarDays className="h-4 w-4 mr-2" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Settings className="h-4 w-4 mr-2" />
            Role Types
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <TeamMemberManager teamId={teamId} teamName={teamName} />
        </TabsContent>
        <TabsContent value="schedule">
          <div className="space-y-4">
            <RosterCalendarView teamId={teamId} />
            <details className="rounded-lg border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/50 select-none">
                Manage events (list view)
              </summary>
              <div className="border-t p-4">
                <RosterEventManager teamId={teamId} teamName={teamName} />
              </div>
            </details>
            <details className="rounded-lg border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted/50 select-none">
                {teamSlug === "pastoral-team" ? "Sunday duties (list view)" : "Roster entries (list view)"}
              </summary>
              <div className="border-t p-4">
                <RosterSchedule teamId={teamId} teamSlug={teamSlug} />
              </div>
            </details>
          </div>
        </TabsContent>
        <TabsContent value="attendance">
          <TeamAttendance teamId={teamId} />
        </TabsContent>
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Manage Role Types</CardTitle>
              <p className="text-sm text-muted-foreground">
                Define the positions/roles available for this team (e.g. Sound Board, Videography, Lead Vocal).
              </p>
            </CardHeader>
            <CardContent>
              <TeamRoleTypeManager teamId={teamId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RosterSchedule({ teamId, teamSlug }: { teamId: string; teamSlug: string }) {
  const queryClient = useQueryClient();
  const isPastoral = teamSlug === "pastoral-team";
  const [addOpen, setAddOpen] = useState(false);
  const [date, setDate] = useState("");
  const [userId, setUserId] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [linkedEventId, setLinkedEventId] = useState<string>("");

  // Edit state
  const [editEntry, setEditEntry] = useState<any>(null);
  const [editUserId, setEditUserId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRole, setEditRole] = useState("");

  const { data: roster, isLoading } = useQuery({
    queryKey: ["roster", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roster_entries")
        .select("*, profiles:user_id(full_name)")
        .eq("team_id", teamId)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["team-members-for-roster", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("team_id", teamId);
      if (error) throw error;
      return data;
    },
  });

  // All upcoming events across all teams (for linking)
  const { data: allEvents } = useQuery({
    queryKey: ["all-upcoming-events-for-link"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("roster_events")
        .select("id, name, event_date, event_time, roster_event_teams(teams(name))")
        .gte("event_date", today)
        .order("event_date")
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: roleTypes } = useTeamRoleTypes(teamId);

  const addEntry = useMutation({
    mutationFn: async () => {
      const member = (members as any)?.find((m: any) => m.user_id === userId);
      const memberName = member?.profiles?.full_name || "This volunteer";
      await assertUserAvailableForRoster(userId, date, memberName);

      const { error } = await supabase.from("roster_entries").insert({
        team_id: teamId,
        user_id: userId,
        scheduled_date: date,
        role_description: roleDesc || null,
        event_id: linkedEventId || null,
      });
      if (error) throw error;

      // Notify the assigned member (in-app + push + email)
      let memberEmail = member?.profiles?.email as string | undefined;
      if (!memberEmail) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", userId)
          .maybeSingle();
        memberEmail = prof?.email || undefined;
      }
      const dateStr = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });

      try {
        await supabase.functions.invoke("notify", {
          body: {
            recipient_id: userId,
            type: "roster_assigned",
            title: `You've been added to the ${teamSlug.replace(/-/g, " ")} roster`,
            body: `${dateStr}${roleDesc ? ` · ${roleDesc}` : ""}`,
            url: "/",
            high_priority: true,
          },
        });
      } catch (err) {
        console.error("notify failed", err);
      }

      if (memberEmail) {
        try {
          await supabase.functions.invoke("send-email", {
            body: {
              to: memberEmail,
              to_name: memberName,
              subject: `You've been added to the roster for ${dateStr}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>Hi ${memberName},</h2>
                  <p>You've been added to the team roster.</p>
                  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
                    <p style="margin:4px 0;"><strong>Date:</strong> ${dateStr}</p>
                    ${roleDesc ? `<p style="margin:4px 0;"><strong>Role:</strong> ${roleDesc}</p>` : ""}
                  </div>
                  <p>— House of Transformation Church</p>
                </div>
              `,
            },
          });
        } catch (err) {
          console.error("email failed", err);
        }
      }
    },
    onSuccess: () => {
      toast.success("Roster entry added & member notified!");
      setAddOpen(false);
      setDate(""); setUserId(""); setRoleDesc(""); setLinkedEventId("");
      queryClient.invalidateQueries({ queryKey: ["roster", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster-event-assignments", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster-standalone-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["roster-assignments-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateEntry = useMutation({
    mutationFn: async () => {
      const member = (members as any)?.find((m: any) => m.user_id === editUserId);
      await assertUserAvailableForRoster(editUserId, editDate, member?.profiles?.full_name || "This volunteer");

      const { error } = await supabase.from("roster_entries").update({
        user_id: editUserId,
        scheduled_date: editDate,
        role_description: editRole || null,
      }).eq("id", editEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry updated");
      setEditEntry(null);
      queryClient.invalidateQueries({ queryKey: ["roster", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster-standalone-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["roster-assignments-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roster_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry removed");
      queryClient.invalidateQueries({ queryKey: ["roster", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster-standalone-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["roster-assignments-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const grouped = (roster || []).reduce((acc: Record<string, any[]>, entry: any) => {
    const d = entry.scheduled_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(entry);
    return acc;
  }, {});

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{isPastoral ? "Sunday Duties" : "Schedule"}</CardTitle>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {isPastoral ? "Assign Duty" : "Add to Roster"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isPastoral ? "Assign Sunday Duty" : "Add Roster Entry"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addEntry.mutate(); }} className="space-y-4">
              <div className="space-y-1">
                <Label>Link to Existing Event (optional)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={linkedEventId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setLinkedEventId(id);
                    const evt = (allEvents || []).find((x: any) => x.id === id);
                    if (evt) setDate(evt.event_date);
                  }}
                >
                  <option value="">None — standalone entry</option>
                  {(allEvents || []).map((evt: any) => {
                    const teamNames = (evt.roster_event_teams || [])
                      .map((rt: any) => rt.teams?.name)
                      .filter(Boolean)
                      .join(", ");
                    const dateLabel = new Date(evt.event_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <option key={evt.id} value={evt.id}>
                        {dateLabel} — {evt.name}{teamNames ? ` (${teamNames})` : ""}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-muted-foreground">Pick an event from any team's roster to attach this assignment to.</p>
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={!!linkedEventId}
                />
              </div>
              <div className="space-y-1">
                <Label>Team Member</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                >
                  <option value="">Select member</option>
                  {members?.map((m: any) => (
                    <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || "Unknown"}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{isPastoral ? "Duty" : "Role/Position"}</Label>
                {isPastoral ? (
                  <>
                    <Input
                      placeholder="e.g. Welcome, Closing, Teaching"
                      value={roleDesc}
                      onChange={(e) => setRoleDesc(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1">
                      {PRESET_PASTOR_DUTIES.map((d) => (
                        <Badge
                          key={d}
                          variant={roleDesc === d ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setRoleDesc(d)}
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Tap a preset or type a custom duty.</p>
                  </>
                ) : roleTypes && roleTypes.length > 0 ? (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={roleDesc}
                    onChange={(e) => setRoleDesc(e.target.value)}
                  >
                    <option value="">Select role (optional)</option>
                    {roleTypes.map((rt) => (
                      <option key={rt.id} value={rt.name}>{rt.name}</option>
                    ))}
                  </select>
                ) : (
                  <Input placeholder="e.g. Lead Vocal, Camera 1" value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} />
                )}
              </div>
              <Button type="submit" className="w-full" disabled={addEntry.isPending}>
                {addEntry.isPending ? "Adding..." : "Add Entry"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No roster entries yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort().map(([dateStr, entries]) => (
              <div key={dateStr}>
                <h4 className="font-display font-semibold text-sm text-muted-foreground mb-2">
                  {new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </h4>
                <div className="space-y-1">
                  {(entries as any[]).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="font-medium text-sm">{e.profiles?.full_name || "Unknown"}</span>
                      <div className="flex items-center gap-1">
                        {e.role_description && (
                          <Badge variant="outline" className="text-xs">{e.role_description}</Badge>
                        )}
                        <Badge
                          variant={e.response_status === "declined" ? "destructive" : e.response_status === "accepted" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {getRosterResponseLabel(e.response_status)}
                        </Badge>
                        <Button
                          size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => { setEditEntry(e); setEditUserId(e.user_id); setEditDate(e.scheduled_date); setEditRole(e.role_description || ""); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                          onClick={() => deleteEntry.mutate(e.id)}
                          disabled={deleteEntry.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Edit roster entry dialog */}
    <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Roster Entry</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); updateEntry.mutate(); }} className="space-y-4">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Team Member</Label>
            <Select value={editUserId} onValueChange={setEditUserId}>
              <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {members?.filter((m: any) => m.user_id).map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.profiles?.full_name || "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{isPastoral ? "Duty" : "Role/Position"}</Label>
            {isPastoral ? (
              <>
                <Input
                  placeholder="e.g. Welcome, Closing, Teaching"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  {PRESET_PASTOR_DUTIES.map((d) => (
                    <Badge
                      key={d}
                      variant={editRole === d ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setEditRole(d)}
                    >
                      {d}
                    </Badge>
                  ))}
                </div>
              </>
            ) : roleTypes && roleTypes.length > 0 ? (
              <Select value={editRole || NO_ROLE_VALUE} onValueChange={(value) => setEditRole(value === NO_ROLE_VALUE ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="No role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROLE_VALUE}>No role</SelectItem>
                  {roleTypes.filter((rt) => rt.name && rt.name.trim()).map((rt) => (
                    <SelectItem key={rt.id} value={rt.name}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="e.g. Lead Vocal, Camera 1" value={editRole} onChange={(e) => setEditRole(e.target.value)} />
            )}
          </div>
          <Button type="submit" className="w-full" disabled={updateEntry.isPending || !editUserId}>
            {updateEntry.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </>
  );
}

const STATUS_OPTIONS = [
  { value: "present", label: "Present", icon: Check, color: "text-green-600" },
  { value: "absent",  label: "Absent",  icon: X,     color: "text-destructive" },
  { value: "excused", label: "Excused", icon: AlertCircle, color: "text-warning" },
  { value: "late",    label: "Late",    icon: Clock,  color: "text-orange-500" },
];

const NO_ROLE_VALUE = "__no_role__";

function TeamAttendance({ teamId }: { teamId: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [saving, setSaving] = useState<string | null>(null);

  const serviceDate = format(weekStart, "yyyy-MM-dd");

  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ["team-members-attendance", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("team_id", teamId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: attendance, isLoading: loadingAtt, refetch } = useQuery({
    queryKey: ["team-attendance", teamId, serviceDate],
    queryFn: async () => {
      if (!members || members.length === 0) return [];
      const userIds = members.map((m: any) => m.user_id);
      const { data, error } = await supabase
        .from("weekly_attendance")
        .select("id, user_id, status, is_self_reported")
        .in("user_id", userIds)
        .eq("service_date", serviceDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!members && members.length > 0,
  });

  const attMap = new Map(
    (attendance || []).map((a: any) => [a.user_id, { id: a.id, status: a.status }])
  );

  const markAttendance = async (userId: string, status: string) => {
    setSaving(userId);
    const existing = attMap.get(userId);
    if (existing) {
      const { error } = await supabase.from("weekly_attendance").update({ status }).eq("id", existing.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("weekly_attendance").insert({
        user_id: userId, service_date: serviceDate, status, is_self_reported: false,
      });
      if (error) toast.error(error.message);
    }
    setSaving(null);
    refetch();
  };

  const present  = (members || []).filter((m: any) => attMap.get(m.user_id)?.status === "present").length;
  const unmarked = (members || []).filter((m: any) => !attMap.get(m.user_id)).length;

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Team Attendance
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {present}/{(members || []).length} present · {unmarked} unmarked
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
              <span className="text-sm">‹</span>
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">
              {format(weekStart, "MMM d, yyyy")}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
              <span className="text-sm">›</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {(loadingMembers || loadingAtt) ? (
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        ) : !members || members.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No team members yet.</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[160px]">Mark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(members as any[]).map((m: any) => {
                  const att = attMap.get(m.user_id);
                  return (
                    <TableRow key={m.user_id}>
                      <TableCell className="font-medium text-sm">{m.profiles?.full_name || "Unknown"}</TableCell>
                      <TableCell>
                        {att?.status ? (
                          <Badge
                            variant={att.status === "present" ? "default" : att.status === "absent" ? "destructive" : "secondary"}
                            className="capitalize text-xs"
                          >
                            {att.status}
                          </Badge>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={att?.status || ""}
                          onValueChange={(val) => markAttendance(m.user_id, val)}
                          disabled={saving === m.user_id}
                        >
                          <SelectTrigger className="h-8 text-xs w-[140px]">
                            <SelectValue placeholder="Mark..." />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
    <TeamAttendanceMetrics teamId={teamId} memberIds={(members || []).map((m: any) => m.user_id)} />
    </div>
  );
}

function TeamAttendanceMetrics({ teamId, memberIds }: { teamId: string; memberIds: string[] }) {
  const weeks = 8;
  const startDate = format(startOfWeek(subWeeks(new Date(), weeks - 1), { weekStartsOn: 0 }), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["team-attendance-metrics", teamId, startDate, memberIds.length],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_attendance")
        .select("service_date, status, user_id")
        .in("user_id", memberIds)
        .gte("service_date", startDate);
      if (error) throw error;
      return data || [];
    },
  });

  const chartData = Array.from({ length: weeks }).map((_, i) => {
    const weekDate = startOfWeek(subWeeks(new Date(), weeks - 1 - i), { weekStartsOn: 0 });
    const ds = format(weekDate, "yyyy-MM-dd");
    const rows = (data || []).filter((d: any) => d.service_date === ds);
    return {
      week: format(weekDate, "MMM d"),
      Present: rows.filter((r: any) => r.status === "present").length,
      Absent: rows.filter((r: any) => r.status === "absent").length,
      Excused: rows.filter((r: any) => r.status === "excused").length,
      Late: rows.filter((r: any) => r.status === "late").length,
    };
  });

  const totalPresent = chartData.reduce((s, c) => s + c.Present, 0);
  const totalSlots = chartData.reduce((s, c) => s + c.Present + c.Absent + c.Excused + c.Late, 0);
  const rate = totalSlots > 0 ? Math.round((totalPresent / totalSlots) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Attendance Trends
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-0.5">
          Last {weeks} weeks · {rate}% present rate ({totalPresent}/{totalSlots} marked)
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading metrics...</p>
        ) : memberIds.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No team members yet.</p>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Present" stackId="a" fill="hsl(var(--primary))" />
                <Bar dataKey="Late" stackId="a" fill="hsl(25 95% 53%)" />
                <Bar dataKey="Excused" stackId="a" fill="hsl(45 93% 47%)" />
                <Bar dataKey="Absent" stackId="a" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

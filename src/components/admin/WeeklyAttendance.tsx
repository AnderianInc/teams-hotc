import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardCheck, Search, ChevronLeft, ChevronRight, Check, X, Clock, AlertCircle, Smartphone, Download } from "lucide-react";
import { downloadCsv } from "@/lib/csvExport";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { toast } from "sonner";
import AttendanceQRDialog from "./AttendanceQRDialog";

interface VolunteerRow {
  user_id: string;
  full_name: string;
  email: string;
  teamNames: string[];
  status: string | null;
  attendanceId: string | null;
  isSelfReported: boolean;
}

interface MemberRow {
  attendee_id: string;
  name: string;
  status: string | null;
  attendanceId: string | null;
  isSelfReported: boolean;
}

const STATUS_OPTIONS = [
  { value: "present", label: "Present", icon: Check, color: "text-green-600" },
  { value: "absent", label: "Absent", icon: X, color: "text-destructive" },
  { value: "excused", label: "Excused", icon: AlertCircle, color: "text-warning" },
  { value: "late", label: "Late", icon: Clock, color: "text-orange-500" },
];

export default function WeeklyAttendance() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState("volunteers");

  const serviceDate = format(weekStart, "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [profilesRes, teamMembersRes, attendanceRes, attendeesRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email"),
      supabase.from("team_members").select("user_id, teams:teams(name)"),
      supabase.from("weekly_attendance").select("id, user_id, attendee_id, status, is_self_reported").eq("service_date", serviceDate),
      supabase.from("attendees").select("id, first_name, last_name").eq("is_member", true),
    ]);

    const profiles = profilesRes.data || [];
    const teamMembers = teamMembersRes.data || [];
    const attendance = attendanceRes.data || [];
    const attendees = attendeesRes.data || [];

    // Build team map
    const userTeamMap = new Map<string, string[]>();
    teamMembers.forEach((tm: any) => {
      const names = userTeamMap.get(tm.user_id) || [];
      if (tm.teams?.name) names.push(tm.teams.name);
      userTeamMap.set(tm.user_id, names);
    });

    // Build attendance maps
    const userAttMap = new Map(
      attendance.filter((a) => a.user_id).map((a) => [a.user_id, { status: a.status, id: a.id, selfReported: a.is_self_reported }])
    );
    const attendeeAttMap = new Map(
      attendance.filter((a) => a.attendee_id).map((a) => [a.attendee_id, { status: a.status, id: a.id, selfReported: a.is_self_reported }])
    );

    // Volunteer rows
    const volRows: VolunteerRow[] = profiles.map((p) => {
      const att = userAttMap.get(p.user_id);
      return {
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        teamNames: userTeamMap.get(p.user_id) || [],
        status: att?.status || null,
        attendanceId: att?.id || null,
        isSelfReported: att?.selfReported || false,
      };
    });
    volRows.sort((a, b) => a.full_name.localeCompare(b.full_name));
    setVolunteers(volRows);

    // Member rows
    const memRows: MemberRow[] = attendees.map((a) => {
      const att = attendeeAttMap.get(a.id);
      return {
        attendee_id: a.id,
        name: `${a.first_name} ${a.last_name}`,
        status: att?.status || null,
        attendanceId: att?.id || null,
        isSelfReported: att?.selfReported || false,
      };
    });
    memRows.sort((a, b) => a.name.localeCompare(b.name));
    setMembers(memRows);

    setLoading(false);
  }, [serviceDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const markVolunteerAttendance = async (userId: string, status: string) => {
    setSaving(userId);
    const existing = volunteers.find((v) => v.user_id === userId);

    if (existing?.attendanceId) {
      const { error } = await supabase.from("weekly_attendance").update({ status }).eq("id", existing.attendanceId);
      if (error) toast.error(error.message);
      else toast.success("Updated");
    } else {
      const { error } = await supabase.from("weekly_attendance").insert({ user_id: userId, service_date: serviceDate, status, is_self_reported: false });
      if (error) toast.error(error.message);
      else toast.success("Recorded");
    }
    setSaving(null);
    fetchData();
  };

  const markMemberAttendance = async (attendeeId: string, status: string) => {
    setSaving(attendeeId);
    const existing = members.find((m) => m.attendee_id === attendeeId);

    if (existing?.attendanceId) {
      const { error } = await supabase.from("weekly_attendance").update({ status }).eq("id", existing.attendanceId);
      if (error) toast.error(error.message);
      else toast.success("Updated");
    } else {
      const { error } = await supabase.from("weekly_attendance").insert({ attendee_id: attendeeId, service_date: serviceDate, status, is_self_reported: false });
      if (error) toast.error(error.message);
      else toast.success("Recorded");
    }
    setSaving(null);
    fetchData();
  };

  const filteredVolunteers = volunteers.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.full_name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q) || v.teamNames.some((t) => t.toLowerCase().includes(q));
  });

  const filteredMembers = members.filter((m) => {
    if (!search) return true;
    return m.name.toLowerCase().includes(search.toLowerCase());
  });

  const volStats = {
    present: volunteers.filter((v) => v.status === "present").length,
    absent: volunteers.filter((v) => v.status === "absent").length,
    excused: volunteers.filter((v) => v.status === "excused").length,
    late: volunteers.filter((v) => v.status === "late").length,
    unmarked: volunteers.filter((v) => !v.status).length,
  };

  const memStats = {
    present: members.filter((m) => m.status === "present").length,
    total: members.length,
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" /> Weekly Attendance
              </CardTitle>
              <CardDescription>Track volunteer, staff, and member attendance each week</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const volRows = volunteers.map((v) => ({
                    type: "volunteer",
                    name: v.full_name,
                    email: v.email,
                    teams: v.teamNames.join("; "),
                    status: v.status ?? "unmarked",
                    self_reported: v.isSelfReported ? "yes" : "no",
                    week: serviceDate,
                  }));
                  const memRows = members.map((m) => ({
                    type: "member",
                    name: m.name,
                    email: "",
                    teams: "",
                    status: m.status ?? "unmarked",
                    self_reported: m.isSelfReported ? "yes" : "no",
                    week: serviceDate,
                  }));
                  downloadCsv(`attendance-${serviceDate}.csv`, [...volRows, ...memRows]);
                }}
              >
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
              <AttendanceQRDialog />
              <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[180px] text-center">
                Week of {format(weekStart, "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, email, or team..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="volunteers">Volunteers / Staff ({volStats.present}/{volunteers.length})</TabsTrigger>
              <TabsTrigger value="members">Church Members ({memStats.present}/{memStats.total})</TabsTrigger>
            </TabsList>

            <TabsContent value="volunteers">
              {/* Stats */}
              <div className="flex gap-3 flex-wrap mb-4">
                <Badge variant="outline" className="gap-1"><Check className="h-3 w-3 text-success" /> {volStats.present} Present</Badge>
                <Badge variant="outline" className="gap-1"><X className="h-3 w-3 text-destructive" /> {volStats.absent} Absent</Badge>
                <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3 text-warning" /> {volStats.excused} Excused</Badge>
                <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3 text-orange-500" /> {volStats.late} Late</Badge>
                <Badge variant="secondary">{volStats.unmarked} Unmarked</Badge>
              </div>

              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading...</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Team(s)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[180px]">Mark</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVolunteers.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No volunteers found</TableCell></TableRow>
                      ) : (
                        filteredVolunteers.map((v) => (
                          <TableRow key={v.user_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div>
                                  <span className="font-medium text-sm">{v.full_name}</span>
                                  <p className="text-xs text-muted-foreground">{v.email}</p>
                                </div>
                                {v.isSelfReported && (
                                  <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                                    <Smartphone className="h-2.5 w-2.5" /> Self
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {v.teamNames.length > 0
                                  ? v.teamNames.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)
                                  : <span className="text-muted-foreground text-sm">—</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {v.status ? (
                                <Badge variant={v.status === "present" ? "default" : v.status === "absent" ? "destructive" : "secondary"} className="capitalize">
                                  {v.status}
                                </Badge>
                              ) : <span className="text-muted-foreground text-sm">—</span>}
                            </TableCell>
                            <TableCell>
                              <Select value={v.status || ""} onValueChange={(val) => markVolunteerAttendance(v.user_id, val)} disabled={saving === v.user_id}>
                                <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Mark..." /></SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="members">
              <div className="flex gap-3 flex-wrap mb-4">
                <Badge variant="outline" className="gap-1"><Check className="h-3 w-3 text-success" /> {memStats.present} Checked In</Badge>
                <Badge variant="secondary">{memStats.total - memStats.present} Not checked in</Badge>
              </div>

              {loading ? (
                <p className="text-muted-foreground text-center py-8">Loading...</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[180px]">Mark</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No members found</TableCell></TableRow>
                      ) : (
                        filteredMembers.map((m) => (
                          <TableRow key={m.attendee_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{m.name}</span>
                                {m.isSelfReported && (
                                  <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                                    <Smartphone className="h-2.5 w-2.5" /> Self
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {m.status ? (
                                <Badge variant={m.status === "present" ? "default" : m.status === "absent" ? "destructive" : "secondary"} className="capitalize">
                                  {m.status}
                                </Badge>
                              ) : <span className="text-muted-foreground text-sm">—</span>}
                            </TableCell>
                            <TableCell>
                              <Select value={m.status || ""} onValueChange={(val) => markMemberAttendance(m.attendee_id, val)} disabled={saving === m.attendee_id}>
                                <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Mark..." /></SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AttendanceTrendChart />
    </div>
  );
}

function AttendanceTrendChart() {
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["attendance-trend"],
    queryFn: async () => {
      // Last 12 weeks
      const weeks: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        // Round to Sunday
        d.setDate(d.getDate() - d.getDay());
        weeks.push(d.toISOString().split("T")[0]);
      }

      const { data, error } = await supabase
        .from("weekly_attendance")
        .select("service_date, status, user_id, attendee_id")
        .in("service_date", weeks);
      if (error) throw error;

      return weeks.map((w) => {
        const weekRows = (data ?? []).filter((r) => r.service_date === w);
        return {
          week: w.slice(5), // MM-DD
          Present: weekRows.filter((r) => r.status === "present").length,
          Late: weekRows.filter((r) => r.status === "late").length,
          Absent: weekRows.filter((r) => r.status === "absent").length,
          Excused: weekRows.filter((r) => r.status === "excused").length,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendance Trend — Last 12 Weeks</CardTitle>
        <CardDescription>Volunteer and member attendance totals per week</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading chart…</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Present" stackId="a" fill="hsl(var(--success, 142 71% 45%))" />
              <Bar dataKey="Late"    stackId="a" fill="hsl(var(--warning, 38 92% 50%))" />
              <Bar dataKey="Excused" stackId="a" fill="hsl(var(--muted-foreground, 215 16% 47%))" />
              <Bar dataKey="Absent"  stackId="a" fill="hsl(var(--destructive, 0 84% 60%))" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

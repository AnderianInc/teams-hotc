import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardCheck, Search, ChevronLeft, ChevronRight, Check, X, Clock, AlertCircle } from "lucide-react";
import { format, startOfWeek, addWeeks, subWeeks, parseISO } from "date-fns";
import { toast } from "sonner";

interface VolunteerRow {
  user_id: string;
  full_name: string;
  email: string;
  teamNames: string[];
  status: string | null;
  attendanceId: string | null;
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const serviceDate = format(weekStart, "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [profilesRes, teamMembersRes, attendanceRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email"),
      supabase.from("team_members").select("user_id, teams:teams(name)"),
      supabase.from("weekly_attendance").select("id, user_id, status").eq("service_date", serviceDate),
    ]);

    const profiles = profilesRes.data || [];
    const teamMembers = teamMembersRes.data || [];
    const attendance = attendanceRes.data || [];

    // Build team map
    const userTeamMap = new Map<string, string[]>();
    teamMembers.forEach((tm: any) => {
      const names = userTeamMap.get(tm.user_id) || [];
      if (tm.teams?.name) names.push(tm.teams.name);
      userTeamMap.set(tm.user_id, names);
    });

    // Build attendance map
    const attendanceMap = new Map(attendance.map((a) => [a.user_id, { status: a.status, id: a.id }]));

    const rows: VolunteerRow[] = profiles.map((p) => {
      const att = attendanceMap.get(p.user_id);
      return {
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        teamNames: userTeamMap.get(p.user_id) || [],
        status: att?.status || null,
        attendanceId: att?.id || null,
      };
    });

    rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
    setVolunteers(rows);
    setLoading(false);
  }, [serviceDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const markAttendance = async (userId: string, status: string) => {
    setSaving(userId);
    const existing = volunteers.find((v) => v.user_id === userId);

    if (existing?.attendanceId) {
      // Update existing
      const { error } = await supabase
        .from("weekly_attendance")
        .update({ status })
        .eq("id", existing.attendanceId);
      if (error) toast.error(error.message);
      else toast.success("Updated");
    } else {
      // Insert new
      const { error } = await supabase
        .from("weekly_attendance")
        .insert({ user_id: userId, service_date: serviceDate, status, is_self_reported: false });
      if (error) toast.error(error.message);
      else toast.success("Recorded");
    }

    setSaving(null);
    fetchData();
  };

  const filtered = volunteers.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.full_name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q) ||
      v.teamNames.some((t) => t.toLowerCase().includes(q));
  });

  const stats = {
    present: volunteers.filter((v) => v.status === "present").length,
    absent: volunteers.filter((v) => v.status === "absent").length,
    excused: volunteers.filter((v) => v.status === "excused").length,
    late: volunteers.filter((v) => v.status === "late").length,
    unmarked: volunteers.filter((v) => !v.status).length,
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
              <CardDescription>Track volunteer and staff attendance each week</CardDescription>
            </div>
            <div className="flex items-center gap-2">
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

          {/* Stats */}
          <div className="flex gap-3 flex-wrap mt-2">
            <Badge variant="outline" className="gap-1"><Check className="h-3 w-3 text-green-600" /> {stats.present} Present</Badge>
            <Badge variant="outline" className="gap-1"><X className="h-3 w-3 text-destructive" /> {stats.absent} Absent</Badge>
            <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3 text-warning" /> {stats.excused} Excused</Badge>
            <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3 text-orange-500" /> {stats.late} Late</Badge>
            <Badge variant="secondary">{stats.unmarked} Unmarked</Badge>
          </div>

          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, email, or team..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
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
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No volunteers found</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((v) => (
                      <TableRow key={v.user_id}>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{v.full_name}</span>
                            <p className="text-xs text-muted-foreground">{v.email}</p>
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
                            <Badge
                              variant={v.status === "present" ? "default" : v.status === "absent" ? "destructive" : "secondary"}
                              className="capitalize"
                            >
                              {v.status}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={v.status || ""}
                            onValueChange={(val) => markAttendance(v.user_id, val)}
                            disabled={saving === v.user_id}
                          >
                            <SelectTrigger className="h-8 text-xs w-[140px]">
                              <SelectValue placeholder="Mark..." />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                  {opt.label}
                                </SelectItem>
                              ))}
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
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { toast } from "sonner";

interface RosterCalendarViewProps {
  teamId?: string;
}

export default function RosterCalendarView({ teamId }: RosterCalendarViewProps) {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterTeamId, setFilterTeamId] = useState<string>(teamId || "all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [addTeamId, setAddTeamId] = useState(teamId || "");
  const [addRole, setAddRole] = useState("");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: teams } = useQuery({
    queryKey: ["all-teams-roster"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !teamId,
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["roster-calendar", filterTeamId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      let query = supabase
        .from("roster_entries")
        .select("id, scheduled_date, role_description, user_id, team_id, teams(name), profiles:user_id(full_name)")
        .gte("scheduled_date", format(monthStart, "yyyy-MM-dd"))
        .lte("scheduled_date", format(monthEnd, "yyyy-MM-dd"))
        .order("scheduled_date");

      if (filterTeamId && filterTeamId !== "all") {
        query = query.eq("team_id", filterTeamId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const activeTeamId = addTeamId || filterTeamId;

  const { data: members } = useQuery({
    queryKey: ["roster-members", activeTeamId],
    queryFn: async () => {
      if (!activeTeamId || activeTeamId === "all") return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name)")
        .eq("team_id", activeTeamId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeTeamId && activeTeamId !== "all",
  });

  const { data: roleTypes } = useQuery({
    queryKey: ["team-role-types", activeTeamId],
    queryFn: async () => {
      if (!activeTeamId || activeTeamId === "all") return [];
      const { data, error } = await supabase
        .from("team_role_types")
        .select("*")
        .eq("team_id", activeTeamId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!activeTeamId && activeTeamId !== "all",
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      const tId = addTeamId || filterTeamId;
      if (!tId || tId === "all") throw new Error("Select a team");
      const { error } = await supabase.from("roster_entries").insert({
        team_id: tId,
        user_id: addUserId,
        scheduled_date: selectedDate,
        role_description: addRole || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Roster entry added!");
      setAddOpen(false);
      setAddUserId("");
      setAddRole("");
      queryClient.invalidateQueries({ queryKey: ["roster-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    (entries || []).forEach((e: any) => {
      const key = e.scheduled_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [entries]);

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (filterTeamId !== "all") setAddTeamId(filterTeamId);
    setAddOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Roster Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            {!teamId && (
              <Select value={filterTeamId} onValueChange={setFilterTeamId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {weekDays.map((d) => (
              <div key={d} className="bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-background min-h-[80px]" />
            ))}
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayEntries = entriesByDate.get(dateStr) || [];
              const today = isToday(day);

              return (
                <div
                  key={dateStr}
                  className={`bg-background min-h-[80px] p-1.5 cursor-pointer hover:bg-muted/50 transition-colors group ${today ? "ring-2 ring-primary ring-inset" : ""}`}
                  onClick={() => handleDayClick(dateStr)}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${today ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {format(day, "d")}
                    </span>
                    <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {dayEntries.slice(0, 3).map((e: any) => (
                      <div
                        key={e.id}
                        className="text-[10px] leading-tight bg-primary/10 text-primary rounded px-1 py-0.5 truncate"
                        title={`${e.profiles?.full_name || "Unknown"} — ${(e.teams as any)?.name || ""} ${e.role_description ? `(${e.role_description})` : ""}`}
                      >
                        {e.profiles?.full_name?.split(" ")[0] || "?"}
                        {filterTeamId === "all" && (
                          <span className="text-muted-foreground ml-0.5">· {(e.teams as any)?.name?.slice(0, 8)}</span>
                        )}
                      </div>
                    ))}
                    {dayEntries.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayEntries.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add Roster Entry — {selectedDate && new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addEntry.mutate(); }} className="space-y-4">
            {!teamId && (
              <div className="space-y-1">
                <Label>Team</Label>
                <Select value={addTeamId} onValueChange={(v) => { setAddTeamId(v); setAddUserId(""); setAddRole(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Team Member</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                required
              >
                <option value="">Select member</option>
                {members?.map((m: any) => (
                  <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || "Unknown"}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Role/Position</Label>
              {roleTypes && roleTypes.length > 0 ? (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                >
                  <option value="">Select role (optional)</option>
                  {roleTypes.map((rt: any) => (
                    <option key={rt.id} value={rt.name}>{rt.name}</option>
                  ))}
                </select>
              ) : (
                <Input placeholder="e.g. Lead Vocal, Camera 1" value={addRole} onChange={(e) => setAddRole(e.target.value)} />
              )}
            </div>
            <Button type="submit" className="w-full" disabled={addEntry.isPending}>
              {addEntry.isPending ? "Adding..." : "Add Entry"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

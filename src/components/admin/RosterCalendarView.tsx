import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, UserPlus, Trash2, Repeat, Pencil } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, addWeeks } from "date-fns";
import { toast } from "sonner";

interface RosterCalendarViewProps {
  teamId?: string;
}

export default function RosterCalendarView({ teamId }: RosterCalendarViewProps) {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterTeamId, setFilterTeamId] = useState<string>(teamId || "all");

  // Create event dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(teamId ? [teamId] : []);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState("4");

  // Day detail dialog
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [detailDate, setDetailDate] = useState("");

  // Assign volunteer dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEvent, setAssignEvent] = useState<any>(null);
  const [assignTeamId, setAssignTeamId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("");

  // Edit assignment dialog
  const [editAssignment, setEditAssignment] = useState<any>(null);
  const [editTeamId, setEditTeamId] = useState("");
  const [editUserId, setEditUserId] = useState("");
  const [editRole, setEditRole] = useState("");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: teams } = useQuery({
    queryKey: ["all-teams-roster"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch events for this month
  const { data: events, isLoading } = useQuery({
    queryKey: ["roster-events-calendar", filterTeamId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const startStr = format(monthStart, "yyyy-MM-dd");
      const endStr = format(monthEnd, "yyyy-MM-dd");

      if (filterTeamId && filterTeamId !== "all") {
        // Get event IDs for this team via junction table
        const { data: junctionData, error: jErr } = await supabase
          .from("roster_event_teams")
          .select("event_id")
          .eq("team_id", filterTeamId);
        if (jErr) throw jErr;
        const eventIds = (junctionData || []).map((j: any) => j.event_id);
        if (eventIds.length === 0) return [];

        const { data, error } = await supabase
          .from("roster_events")
          .select("*")
          .in("id", eventIds)
          .gte("event_date", startStr)
          .lte("event_date", endStr)
          .order("event_date");
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("roster_events")
          .select("*")
          .gte("event_date", startStr)
          .lte("event_date", endStr)
          .order("event_date");
        if (error) throw error;
        return data;
      }
    },
  });

  // Fetch event-team associations
  const eventIds = (events || []).map((e: any) => e.id);
  const { data: eventTeams } = useQuery({
    queryKey: ["roster-event-teams-calendar", eventIds],
    queryFn: async () => {
      if (eventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("roster_event_teams")
        .select("event_id, team_id, teams(name)")
        .in("event_id", eventIds);
      if (error) throw error;
      return data;
    },
    enabled: eventIds.length > 0,
  });

  // Fetch assignments for events
  const { data: assignments } = useQuery({
    queryKey: ["roster-assignments-calendar", eventIds],
    queryFn: async () => {
      if (eventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("roster_entries")
        .select("*, profiles:user_id(full_name), teams(name)")
        .in("event_id", eventIds);
      if (error) throw error;
      return data;
    },
    enabled: eventIds.length > 0,
  });

  // Standalone roster entries (no event_id)
  const { data: standaloneEntries } = useQuery({
    queryKey: ["roster-standalone-calendar", filterTeamId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      let query = supabase
        .from("roster_entries")
        .select("id, scheduled_date, role_description, user_id, team_id, teams(name), profiles:user_id(full_name)")
        .is("event_id", null)
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

  // Members for the selected assign team
  const { data: members } = useQuery({
    queryKey: ["roster-members", assignTeamId],
    queryFn: async () => {
      if (!assignTeamId) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("team_id", assignTeamId);
      if (error) throw error;
      return data;
    },
    enabled: !!assignTeamId,
  });

  // Members for edit team
  const activeTeamId = assignTeamId || editTeamId;
  const { data: editMembers } = useQuery({
    queryKey: ["roster-members", editTeamId],
    queryFn: async () => {
      if (!editTeamId) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("team_id", editTeamId);
      if (error) throw error;
      return data;
    },
    enabled: !!editTeamId,
  });

  const { data: roleTypes } = useQuery({
    queryKey: ["team-role-types", activeTeamId],
    queryFn: async () => {
      if (!activeTeamId) return [];
      const { data, error } = await supabase
        .from("team_role_types")
        .select("*")
        .eq("team_id", activeTeamId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!activeTeamId,
  });

  // Create event mutation (supports recurring + multi-team)
  const createEvent = useMutation({
    mutationFn: async () => {
      if (selectedTeamIds.length === 0) throw new Error("Select at least one team");
      if (!eventName || !selectedDate) throw new Error("Name and date required");

      const dates: string[] = [selectedDate];
      if (isRecurring) {
        const count = parseInt(recurrenceCount) || 4;
        const baseDate = new Date(selectedDate + "T00:00:00");
        for (let i = 1; i < count; i++) {
          let next: Date;
          if (recurrenceType === "weekly") next = addWeeks(baseDate, i);
          else if (recurrenceType === "biweekly") next = addWeeks(baseDate, i * 2);
          else next = addMonths(baseDate, i);
          dates.push(format(next, "yyyy-MM-dd"));
        }
      }

      // Create events (top-level, no team_id)
      const eventRows = dates.map((d) => ({
        name: eventName,
        event_date: d,
        event_time: eventTime || null,
        description: eventDesc || null,
        team_id: null,
      }));

      const { data: createdEvents, error } = await supabase
        .from("roster_events")
        .insert(eventRows)
        .select("id");
      if (error) throw error;

      // Create junction entries for each event × team
      const junctionRows = (createdEvents || []).flatMap((evt: any) =>
        selectedTeamIds.map((tId) => ({ event_id: evt.id, team_id: tId }))
      );
      if (junctionRows.length > 0) {
        const { error: jErr } = await supabase.from("roster_event_teams").insert(junctionRows);
        if (jErr) throw jErr;
      }
    },
    onSuccess: () => {
      toast.success(isRecurring ? "Recurring events created!" : "Event created!");
      setCreateOpen(false);
      resetCreateForm();
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Assign volunteer mutation
  const assignVolunteer = useMutation({
    mutationFn: async () => {
      if (!assignEvent || !assignTeamId) throw new Error("No event/team selected");
      const { error } = await supabase.from("roster_entries").insert({
        team_id: assignTeamId,
        user_id: assignUserId,
        scheduled_date: assignEvent.event_date,
        role_description: assignRole || null,
        event_id: assignEvent.id,
      });
      if (error) throw error;

      // Send notification email
      const member = members?.find((m: any) => m.user_id === assignUserId);
      const email = (member?.profiles as any)?.email;
      const name = (member?.profiles as any)?.full_name || "Volunteer";
      const teamName = teams?.find((t) => t.id === assignTeamId)?.name || "your team";
      if (email) {
        try {
          const dateStr = new Date(assignEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric"
          });
          await supabase.functions.invoke("send-email", {
            body: {
              to: email,
              subject: `You've been assigned to: ${assignEvent.name}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2>Hi ${name},</h2>
                <p>You've been assigned to an upcoming event with <strong>${teamName}</strong>.</p>
                <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
                  <p><strong>Event:</strong> ${assignEvent.name}</p>
                  <p><strong>Date:</strong> ${dateStr}</p>
                  ${assignEvent.event_time ? `<p><strong>Time:</strong> ${assignEvent.event_time}</p>` : ""}
                  ${assignRole ? `<p><strong>Role:</strong> ${assignRole}</p>` : ""}
                </div>
                <p>— House of Transformation Church</p>
              </div>`,
            },
          });
        } catch (err) {
          console.error("Email notification failed:", err);
        }
      }

      // In-app + push notification
      try {
        const teamName = teams?.find((t) => t.id === assignTeamId)?.name || "your team";
        const dateStr = new Date(assignEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric",
        });
        await supabase.functions.invoke("notify", {
          body: {
            recipient_id: assignUserId,
            type: "roster_assigned",
            title: `You've been assigned: ${assignEvent.name}`,
            body: `${teamName} · ${dateStr}`,
            url: "/",
          },
        });
      } catch (err) {
        console.error("Push notification failed:", err);
      }
    },
    onSuccess: () => {
      toast.success("Volunteer assigned & notified!");
      setAssignOpen(false);
      setAssignUserId("");
      setAssignRole("");
      setAssignTeamId("");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
      await supabase.from("roster_entries").delete().eq("event_id", eventId);
      await supabase.from("roster_event_teams").delete().eq("event_id", eventId);
      const { error } = await supabase.from("roster_events").delete().eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from("roster_entries").delete().eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ id, user_id, role_description }: { id: string; user_id: string; role_description: string | null }) => {
      const { error } = await supabase.from("roster_entries").update({ user_id, role_description }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      setEditAssignment(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["roster-events-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-event-teams-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-assignments-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-standalone-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-events"] });
    queryClient.invalidateQueries({ queryKey: ["roster-event-assignments"] });
  }

  function resetCreateForm() {
    setEventName(""); setEventTime(""); setEventDesc("");
    setSelectedTeamIds(teamId ? [teamId] : []);
    setIsRecurring(false); setRecurrenceType("weekly"); setRecurrenceCount("4");
  }

  function toggleTeamSelection(tId: string) {
    setSelectedTeamIds((prev) =>
      prev.includes(tId) ? prev.filter((id) => id !== tId) : [...prev, tId]
    );
  }

  // Build calendar data
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    (events || []).forEach((e: any) => {
      const key = e.event_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [events]);

  const eventTeamsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    (eventTeams || []).forEach((et: any) => {
      if (!map.has(et.event_id)) map.set(et.event_id, []);
      map.get(et.event_id)!.push(et);
    });
    return map;
  }, [eventTeams]);

  const assignmentsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    (assignments || []).forEach((a: any) => {
      if (!a.event_id) return;
      if (!map.has(a.event_id)) map.set(a.event_id, []);
      map.get(a.event_id)!.push(a);
    });
    return map;
  }, [assignments]);

  const standaloneByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    (standaloneEntries || []).forEach((e: any) => {
      const key = e.scheduled_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [standaloneEntries]);

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleDayClick = (dateStr: string) => {
    setDetailDate(dateStr);
    setDayDetailOpen(true);
  };

  const handleCreateOnDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (teamId) setSelectedTeamIds([teamId]);
    setDayDetailOpen(false);
    setCreateOpen(true);
  };

  const handleAssign = (event: any) => {
    setAssignEvent(event);
    // Pre-select the first team on the event
    const evtTeams = eventTeamsByEvent.get(event.id) || [];
    setAssignTeamId(evtTeams.length === 1 ? evtTeams[0].team_id : "");
    setDayDetailOpen(false);
    setAssignOpen(true);
  };

  // Detail date data
  const detailEvents = eventsByDate.get(detailDate) || [];
  const detailStandalone = standaloneByDate.get(detailDate) || [];

  return (
    <>
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
                const dayEvents = eventsByDate.get(dateStr) || [];
                const dayStandalone = standaloneByDate.get(dateStr) || [];
                const totalItems = dayEvents.length + dayStandalone.length;
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
                      {dayEvents.slice(0, 2).map((e: any) => {
                        const count = assignmentsByEvent.get(e.id)?.length || 0;
                        const evtTeamNames = (eventTeamsByEvent.get(e.id) || [])
                          .map((et: any) => (et.teams as any)?.name)
                          .filter(Boolean);
                        return (
                          <div
                            key={e.id}
                            className="text-[10px] leading-tight bg-primary/10 text-primary rounded px-1 py-0.5 truncate"
                            title={`${e.name} — ${evtTeamNames.join(", ")} — ${count} assigned`}
                          >
                            {e.name.length > 12 ? e.name.slice(0, 12) + "…" : e.name}
                            {count > 0 && <span className="ml-0.5 text-muted-foreground">({count})</span>}
                          </div>
                        );
                      })}
                      {dayStandalone.slice(0, Math.max(0, 2 - dayEvents.length)).map((e: any) => (
                        <div
                          key={e.id}
                          className="text-[10px] leading-tight bg-secondary/50 text-secondary-foreground rounded px-1 py-0.5 truncate"
                        >
                          {e.profiles?.full_name?.split(" ")[0] || "?"}
                        </div>
                      ))}
                      {totalItems > 2 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{totalItems - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail dialog */}
      <Dialog open={dayDetailOpen} onOpenChange={setDayDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailDate && new Date(detailDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Button size="sm" onClick={() => handleCreateOnDate(detailDate)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Create Event on This Date
            </Button>

            {detailEvents.length === 0 && detailStandalone.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No events or assignments on this date.</p>
            )}

            {detailEvents.map((event: any) => {
              const eventAssigns = assignmentsByEvent.get(event.id) || [];
              const evtTeams = eventTeamsByEvent.get(event.id) || [];
              return (
                <Card key={event.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm">{event.name}</CardTitle>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {event.event_time && <Badge variant="outline" className="text-xs">{event.event_time}</Badge>}
                          {evtTeams.map((et: any) => (
                            <Badge key={et.team_id} variant="secondary" className="text-xs">
                              {(et.teams as any)?.name}
                            </Badge>
                          ))}
                        </div>
                        {event.description && <p className="text-xs text-muted-foreground mt-1">{event.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleAssign(event)}>
                          <UserPlus className="h-3 w-3 mr-1" /> Assign
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteEvent.mutate(event.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {eventAssigns.length > 0 && (
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Volunteer</TableHead>
                            <TableHead className="text-xs">Team</TableHead>
                            <TableHead className="text-xs">Role</TableHead>
                            <TableHead className="w-[70px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventAssigns.map((a: any) => (
                            <TableRow key={a.id}>
                              <TableCell className="text-sm">{a.profiles?.full_name || "Unknown"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{(a.teams as any)?.name || "—"}</Badge>
                              </TableCell>
                              <TableCell>
                                {a.role_description ? <Badge variant="secondary" className="text-xs">{a.role_description}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-0.5">
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditAssignment(a); setEditTeamId(a.team_id); setEditUserId(a.user_id); setEditRole(a.role_description || ""); }}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAssignment.mutate(a.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  )}
                </Card>
              );
            })}

            {detailStandalone.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Individual Assignments</h4>
                {detailStandalone.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between text-sm py-1">
                    <span>{e.profiles?.full_name || "Unknown"} {e.role_description && <Badge variant="outline" className="text-xs ml-1">{e.role_description}</Badge>}</span>
                    <Badge variant="secondary" className="text-xs">{(e.teams as any)?.name}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create event dialog — multi-team selection */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create Event — {selectedDate && new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createEvent.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Event Name</Label>
              <Input placeholder="e.g. Sunday Worship Service" value={eventName} onChange={(e) => setEventName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Time (optional)</Label>
              <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea placeholder="Event details..." value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} rows={2} />
            </div>

            {/* Multi-team selection */}
            {!teamId && (
              <div className="space-y-2">
                <Label>Assign Teams</Label>
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto border rounded-md p-2">
                  {teams?.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox
                        checked={selectedTeamIds.includes(t.id)}
                        onCheckedChange={() => toggleTeamSelection(t.id)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
                {selectedTeamIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedTeamIds.map((tId) => {
                      const t = teams?.find((x) => x.id === tId);
                      return t ? <Badge key={tId} variant="secondary" className="text-xs">{t.name}</Badge> : null;
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Recurring */}
            <div className="flex items-center gap-2">
              <Checkbox id="recurring" checked={isRecurring} onCheckedChange={(v) => setIsRecurring(!!v)} />
              <Label htmlFor="recurring" className="flex items-center gap-1 cursor-pointer">
                <Repeat className="h-4 w-4" /> Recurring event
              </Label>
            </div>
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs">Frequency</Label>
                  <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Occurrences</Label>
                  <Input type="number" min="2" max="52" value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)} />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={createEvent.isPending}>
              {createEvent.isPending ? "Creating..." : isRecurring ? `Create ${recurrenceCount} Events` : "Create Event"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign volunteer dialog — select team first, then member */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Volunteer to {assignEvent?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); assignVolunteer.mutate(); }} className="space-y-4">
            {/* Team selection — scoped to event's teams */}
            <div className="space-y-1">
              <Label>Team</Label>
              {(() => {
                const evtTeams = assignEvent ? (eventTeamsByEvent.get(assignEvent.id) || []) : [];
                return (
                  <Select value={assignTeamId} onValueChange={(v) => { setAssignTeamId(v); setAssignUserId(""); setAssignRole(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {evtTeams.map((et: any) => (
                        <SelectItem key={et.team_id} value={et.team_id}>
                          {(et.teams as any)?.name || "Unknown"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>
            <div className="space-y-1">
              <Label>Team Member</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId} disabled={!assignTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder={assignTeamId ? "Select volunteer" : "Select a team first"} />
                </SelectTrigger>
                <SelectContent>
                  {members?.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Role/Position</Label>
              {roleTypes && roleTypes.length > 0 ? (
                <Select value={assignRole} onValueChange={setAssignRole} disabled={!assignTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleTypes.map((rt: any) => (
                      <SelectItem key={rt.id} value={rt.name}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="e.g. Sound Board, Camera 1" value={assignRole} onChange={(e) => setAssignRole(e.target.value)} disabled={!assignTeamId} />
              )}
            </div>
            <Button type="submit" className="w-full" disabled={assignVolunteer.isPending || !assignUserId || !assignTeamId}>
              {assignVolunteer.isPending ? "Assigning..." : "Assign & Notify"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit assignment dialog */}
      <Dialog open={!!editAssignment} onOpenChange={(open) => !open && setEditAssignment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateAssignment.mutate({ id: editAssignment.id, user_id: editUserId, role_description: editRole || null }); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Team Member</Label>
              <Select value={editUserId} onValueChange={setEditUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select volunteer" />
                </SelectTrigger>
                <SelectContent>
                  {(editMembers || []).map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Role/Position</Label>
              {roleTypes && roleTypes.length > 0 ? (
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No role</SelectItem>
                    {roleTypes.map((rt: any) => (
                      <SelectItem key={rt.id} value={rt.name}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="e.g. Sound Board, Camera 1" value={editRole} onChange={(e) => setEditRole(e.target.value)} />
              )}
            </div>
            <Button type="submit" className="w-full" disabled={updateAssignment.isPending || !editUserId}>
              {updateAssignment.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

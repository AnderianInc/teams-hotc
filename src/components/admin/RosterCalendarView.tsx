import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { assertUserAvailableForRoster, getRosterResponseLabel } from "@/lib/rosterAvailability";
import { generateServiceFromTemplate } from "@/hooks/useOrderOfService";

interface RosterCalendarViewProps {
  teamId?: string;
}

const NO_ROLE_VALUE = "__no_role__";

export default function RosterCalendarView({ teamId }: RosterCalendarViewProps) {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterTeamId, setFilterTeamId] = useState(teamId || "all");
  const [detailDate, setDetailDate] = useState("");
  const [dayDetailOpen, setDayDetailOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(teamId ? [teamId] : []);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEvent, setAssignEvent] = useState<any>(null);
  const [assignTeamId, setAssignTeamId] = useState(teamId || "");
  const [assignUserIds, setAssignUserIds] = useState<string[]>([]);
  const [assignRole, setAssignRole] = useState("");

  const [editAssignment, setEditAssignment] = useState<any>(null);
  const [editUserId, setEditUserId] = useState("");
  const [editRole, setEditRole] = useState("");
  const [runSheetOpen, setRunSheetOpen] = useState(false);
  const [runSheetEvent, setRunSheetEvent] = useState<any>(null);
  const [runSheetTemplateId, setRunSheetTemplateId] = useState("");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const canManageMasterSchedule = isAdmin && !teamId;

  const { data: teamMembership } = useQuery({
    queryKey: ["current-team-membership", teamId, user?.id],
    enabled: !!teamId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const canAssignForTeam = isAdmin || teamMembership?.role === "team_lead";

  const { data: teams = [] } = useQuery({
    queryKey: ["all-teams-roster"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["service-templates-for-schedule-run-sheet"],
    enabled: canManageMasterSchedule,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_templates")
        .select("id, name, default_start_time")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["roster-events-calendar", filterTeamId, teamId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const startStr = format(monthStart, "yyyy-MM-dd");
      const endStr = format(monthEnd, "yyyy-MM-dd");
      const activeTeamId = teamId || (filterTeamId !== "all" ? filterTeamId : "");

      if (activeTeamId) {
        const { data: links, error: linkError } = await supabase
          .from("roster_event_teams")
          .select("event_id")
          .eq("team_id", activeTeamId);
        if (linkError) throw linkError;
        const eventIds = (links || []).map((l: any) => l.event_id);
        if (!eventIds.length) return [];
        const { data, error } = await supabase
          .from("roster_events")
          .select("*")
          .in("id", eventIds)
          .gte("event_date", startStr)
          .lte("event_date", endStr)
          .order("event_date")
          .order("event_time");
        if (error) throw error;
        return data || [];
      }

      const { data, error } = await supabase
        .from("roster_events")
        .select("*")
        .gte("event_date", startStr)
        .lte("event_date", endStr)
        .order("event_date")
        .order("event_time");
      if (error) throw error;
      return data || [];
    },
  });

  const eventIds = events.map((event: any) => event.id);

  const { data: eventTeams = [] } = useQuery({
    queryKey: ["roster-event-teams-calendar", eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roster_event_teams")
        .select("event_id, team_id, teams(name)")
        .in("event_id", eventIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["roster-assignments-calendar", eventIds, teamId],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      let query = supabase
        .from("roster_entries")
        .select("*, profiles:user_id(full_name, email), teams(name)")
        .in("event_id", eventIds);
      if (teamId) query = query.eq("team_id", teamId);
      const { data, error } = await query.order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["roster-members", assignTeamId],
    enabled: !!assignTeamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("team_id", assignTeamId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: roleTypes = [] } = useQuery({
    queryKey: ["team-role-types", assignTeamId],
    enabled: !!assignTeamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_role_types")
        .select("*")
        .eq("team_id", assignTeamId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: linkedRunSheets = [] } = useQuery({
    queryKey: ["service-instances-by-roster-event", eventIds],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_instances")
        .select("id, roster_event_id, status")
        .in("roster_event_id", eventIds);
      if (error) throw error;
      return data || [];
    },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["roster-events-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-event-teams-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-assignments-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-events"] });
    queryClient.invalidateQueries({ queryKey: ["roster-event-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["roster"] });
    queryClient.invalidateQueries({ queryKey: ["service-instances"] });
    queryClient.invalidateQueries({ queryKey: ["service-instances-by-roster-event"] });
  }

  function resetEventForm(date = "") {
    setEditingEvent(null);
    setEventName("");
    setEventDate(date);
    setEventTime("");
    setEventDesc("");
    setSelectedTeamIds(teamId ? [teamId] : []);
  }

  function openCreate(date: string) {
    resetEventForm(date);
    setDayDetailOpen(false);
    setCreateOpen(true);
  }

  function openEdit(event: any) {
    setEditingEvent(event);
    setEventName(event.name || "");
    setEventDate(event.event_date || "");
    setEventTime(event.event_time?.slice(0, 5) || "");
    setEventDesc(event.description || "");
    setSelectedTeamIds((eventTeamsByEvent.get(event.id) || []).map((link: any) => link.team_id));
    setDayDetailOpen(false);
    setCreateOpen(true);
  }

  function toggleTeamSelection(id: string) {
    setSelectedTeamIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const saveEvent = useMutation({
    mutationFn: async () => {
      if (!canManageMasterSchedule) throw new Error("Only admins can manage the master schedule");
      if (!eventName.trim() || !eventDate) throw new Error("Service name and date are required");
      if (!selectedTeamIds.length) throw new Error("Select at least one team");

      if (editingEvent) {
        const { error } = await supabase
          .from("roster_events")
          .update({
            name: eventName.trim(),
            event_date: eventDate,
            event_time: eventTime || null,
            description: eventDesc.trim() || null,
          })
          .eq("id", editingEvent.id);
        if (error) throw error;

        const current = eventTeamsByEvent.get(editingEvent.id) || [];
        const currentIds = current.map((link: any) => link.team_id);
        const toAdd = selectedTeamIds.filter((id) => !currentIds.includes(id));
        const toRemove = currentIds.filter((id: string) => !selectedTeamIds.includes(id));

        if (toRemove.length) {
          const { error: deleteError } = await supabase
            .from("roster_event_teams")
            .delete()
            .eq("event_id", editingEvent.id)
            .in("team_id", toRemove);
          if (deleteError) throw deleteError;
        }
        if (toAdd.length) {
          const { error: insertError } = await supabase
            .from("roster_event_teams")
            .insert(toAdd.map((id) => ({ event_id: editingEvent.id, team_id: id })));
          if (insertError) throw insertError;
        }
        return;
      }

      const { data: created, error } = await supabase
        .from("roster_events")
        .insert({
          name: eventName.trim(),
          event_date: eventDate,
          event_time: eventTime || null,
          description: eventDesc.trim() || null,
          team_id: null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: linkError } = await supabase
        .from("roster_event_teams")
        .insert(selectedTeamIds.map((id) => ({ event_id: created.id, team_id: id })));
      if (linkError) throw linkError;
    },
    onSuccess: () => {
      toast.success(editingEvent ? "Master schedule updated" : "Service added to master schedule");
      setCreateOpen(false);
      resetEventForm();
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      if (!canManageMasterSchedule) throw new Error("Only admins can delete master schedule dates");
      await supabase.from("roster_entries").delete().eq("event_id", id);
      await supabase.from("roster_event_teams").delete().eq("event_id", id);
      const { error } = await supabase.from("roster_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service removed from master schedule");
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignVolunteer = useMutation({
    mutationFn: async () => {
      if (!assignEvent || !assignTeamId || assignUserIds.length === 0) throw new Error("Choose a service, team, and at least one member");
      if (teamId && assignTeamId !== teamId) throw new Error("Team leaders can only assign their own team");
      if (teamId && !canAssignForTeam) throw new Error("Only team leaders can assign members");

      for (const userId of assignUserIds) {
        const member = (members as any[]).find((item) => item.user_id === userId);
        await assertUserAvailableForRoster(
          userId,
          assignEvent.event_date,
          member?.profiles?.full_name || "This volunteer",
        );
      }

      const { error } = await supabase.from("roster_entries").insert(
        assignUserIds.map((userId) => ({
          team_id: assignTeamId,
          user_id: userId,
          scheduled_date: assignEvent.event_date,
          role_description: assignRole || null,
          event_id: assignEvent.id,
        }))
      );
      if (error) throw error;

      try {
        const teamName = teams.find((team: any) => team.id === assignTeamId)?.name || "your team";
        const dateStr = new Date(assignEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric",
        });
        await Promise.all(assignUserIds.map((userId) =>
          supabase.functions.invoke("notify", {
            body: {
              recipient_id: userId,
              type: "roster_assigned",
              title: `You've been assigned: ${assignEvent.name}`,
              body: `${teamName} · ${dateStr}${assignRole ? ` · ${assignRole}` : ""}`,
              url: "/dashboard",
            },
          })
        ));
      } catch (error) {
        console.error("Notification failed", error);
      }
    },
    onSuccess: () => {
      toast.success("Members assigned");
      setAssignOpen(false);
      setAssignUserIds([]);
      setAssignRole("");
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateAssignment = useMutation({
    mutationFn: async () => {
      if (!editAssignment || !editUserId) throw new Error("Choose a member");
      if (teamId && editAssignment.team_id !== teamId) throw new Error("Team leaders can only edit their own team");
      if (teamId && !canAssignForTeam) throw new Error("Only team leaders can edit assignments");

      const member = (members as any[]).find((item) => item.user_id === editUserId);
      await assertUserAvailableForRoster(
        editUserId,
        editAssignment.scheduled_date,
        member?.profiles?.full_name || "This volunteer",
      );

      const { error } = await supabase
        .from("roster_entries")
        .update({ user_id: editUserId, role_description: editRole || null })
        .eq("id", editAssignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      setEditAssignment(null);
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (entry: any) => {
      if (teamId && entry.team_id !== teamId) throw new Error("Team leaders can only remove their own team assignments");
      if (teamId && !canAssignForTeam) throw new Error("Only team leaders can remove assignments");
      const { error } = await supabase.from("roster_entries").delete().eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment removed");
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createRunSheet = useMutation({
    mutationFn: async () => {
      if (!runSheetEvent || !runSheetTemplateId) throw new Error("Choose a template");
      const instance = await generateServiceFromTemplate(runSheetTemplateId, runSheetEvent.event_date, {
        rosterEventId: runSheetEvent.id,
        title: runSheetEvent.name,
        startTime: runSheetEvent.event_time,
        createRosterEvent: false,
      });
      return instance;
    },
    onSuccess: (instance) => {
      toast.success("Run sheet created");
      setRunSheetOpen(false);
      setRunSheetTemplateId("");
      setRunSheetEvent(null);
      invalidateAll();
      window.location.href = `/admin/order-of-service/${instance.id}`;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    events.forEach((event: any) => {
      if (!map.has(event.event_date)) map.set(event.event_date, []);
      map.get(event.event_date)!.push(event);
    });
    return map;
  }, [events]);

  const eventTeamsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    eventTeams.forEach((link: any) => {
      if (!map.has(link.event_id)) map.set(link.event_id, []);
      map.get(link.event_id)!.push(link);
    });
    return map;
  }, [eventTeams]);

  const assignmentsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    assignments.forEach((assignment: any) => {
      if (!assignment.event_id) return;
      if (!map.has(assignment.event_id)) map.set(assignment.event_id, []);
      map.get(assignment.event_id)!.push(assignment);
    });
    return map;
  }, [assignments]);

  const runSheetByEvent = useMemo(() => {
    const map = new Map<string, any>();
    linkedRunSheets.forEach((sheet: any) => {
      if (sheet.roster_event_id) map.set(sheet.roster_event_id, sheet);
    });
    return map;
  }, [linkedRunSheets]);

  const detailEvents = eventsByDate.get(detailDate) || [];

  function openAssign(event: any, defaultTeamId?: string) {
    setAssignEvent(event);
    setAssignTeamId(teamId || defaultTeamId || "");
    setAssignUserIds([]);
    setAssignRole("");
    setAssignOpen(true);
  }

  function openEditAssignment(entry: any) {
    setEditAssignment(entry);
    setAssignTeamId(entry.team_id);
    setEditUserId(entry.user_id);
    setEditRole(entry.role_description || "");
  }

  function openRunSheetCreate(event: any) {
    setRunSheetEvent(event);
    setRunSheetTemplateId("");
    setDayDetailOpen(false);
    setRunSheetOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5" />
                {teamId ? "Team Assignments" : "Master Schedule"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {teamId
                  ? "Assign your team members to admin-created service dates."
                  : "Create service dates, times, and required teams for the whole church."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!teamId && (
                <Select value={filterTeamId} onValueChange={setFilterTeamId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {teams.map((team: any) => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {canManageMasterSchedule && (
                <Button size="sm" onClick={() => openCreate(format(new Date(), "yyyy-MM-dd"))}>
                  <Plus className="h-4 w-4 mr-1" /> Add service
                </Button>
              )}
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">{format(currentMonth, "MMMM yyyy")}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading schedule…</p>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {weekDays.map((day) => (
                <div key={day} className="bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground">{day}</div>
              ))}
              {Array.from({ length: startDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="bg-background min-h-[96px]" />
              ))}
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDate.get(dateStr) || [];
                return (
                  <button
                    key={dateStr}
                    type="button"
                    className={`bg-background min-h-[96px] p-1.5 text-left hover:bg-muted/50 transition-colors ${isToday(day) ? "ring-2 ring-primary ring-inset" : ""}`}
                    onClick={() => { setDetailDate(dateStr); setDayDetailOpen(true); }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${isToday(day) ? "text-primary font-bold" : "text-muted-foreground"}`}>{format(day, "d")}</span>
                      {canManageMasterSchedule && <Plus className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <div className="space-y-1 mt-1">
                      {dayEvents.slice(0, 3).map((event: any) => {
                        const teamCount = (eventTeamsByEvent.get(event.id) || []).length;
                        const assignedCount = (assignmentsByEvent.get(event.id) || []).length;
                        return (
                          <div key={event.id} className="rounded border bg-primary/10 px-1.5 py-1 text-[10px] leading-tight">
                            <div className="font-medium text-primary truncate">{event.event_time?.slice(0, 5) || "No time"} · {event.name}</div>
                            <div className="text-muted-foreground truncate">{teamCount} teams · {assignedCount} assigned</div>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dayDetailOpen} onOpenChange={setDayDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[82vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailDate && new Date(detailDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {canManageMasterSchedule && (
              <Button size="sm" onClick={() => openCreate(detailDate)} className="w-full">
                <Plus className="h-4 w-4 mr-2" /> Add service on this date
              </Button>
            )}

            {detailEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No scheduled services on this date.</p>
            ) : detailEvents.map((event: any) => {
              const links = eventTeamsByEvent.get(event.id) || [];
              const eventAssignments = assignmentsByEvent.get(event.id) || [];
              const runSheet = runSheetByEvent.get(event.id);
              const visibleRunSheet = runSheet && (isAdmin || runSheet.status === "published") ? runSheet : null;
              return (
                <Card key={event.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{event.name}</CardTitle>
                        <div className="flex flex-wrap items-center gap-1 mt-2">
                          <Badge variant="outline">{event.event_time?.slice(0, 5) || "No time"}</Badge>
                          <Badge variant="outline">{eventAssignments.length} assigned</Badge>
                        </div>
                        {event.description && <p className="text-sm text-muted-foreground mt-2">{event.description}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {teamId && canAssignForTeam && <Button size="sm" variant="outline" onClick={() => openAssign(event, teamId)}><UserPlus className="h-4 w-4 mr-1" /> Assign</Button>}
                        {!teamId && <Button size="sm" variant="outline" onClick={() => openAssign(event)}><UserPlus className="h-4 w-4 mr-1" /> Assign</Button>}
                        {visibleRunSheet && <Button size="sm" variant="outline" onClick={() => window.location.href = `${isAdmin ? "/admin" : ""}/order-of-service/${visibleRunSheet.id}`}><ClipboardList className="h-4 w-4 mr-1" /> Run sheet</Button>}
                        {!runSheet && canManageMasterSchedule && <Button size="sm" variant="outline" onClick={() => openRunSheetCreate(event)}><ClipboardList className="h-4 w-4 mr-1" /> Create run sheet</Button>}
                        {canManageMasterSchedule && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(event)}><Pencil className="h-4 w-4" /></Button>}
                        {canManageMasterSchedule && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteEvent.mutate(event.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                  </CardHeader>
                  {links.length > 0 && (
                    <CardContent className="pt-0 space-y-3">
                      {links.map((link: any) => {
                        const teamAssignments = eventAssignments.filter((entry: any) => entry.team_id === link.team_id);
                        return (
                          <div key={link.team_id} className="rounded-md border p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-sm font-medium">{link.teams?.name || "Team"}</p>
                              {!teamId && <Button size="sm" variant="outline" onClick={() => openAssign(event, link.team_id)}><UserPlus className="h-3 w-3 mr-1" /> Assign</Button>}
                            </div>
                            {teamAssignments.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No members assigned yet.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Member</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    {(canManageMasterSchedule || (teamId === link.team_id && canAssignForTeam)) && <TableHead className="w-[80px]" />}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {teamAssignments.map((entry: any) => (
                                    <TableRow key={entry.id}>
                                      <TableCell className="font-medium">{entry.profiles?.full_name || "Unknown"}</TableCell>
                                      <TableCell>{entry.role_description || "—"}</TableCell>
                                      <TableCell><Badge variant={entry.response_status === "accepted" ? "default" : entry.response_status === "declined" ? "destructive" : "outline"}>{getRosterResponseLabel(entry.response_status)}</Badge></TableCell>
                                      {(canManageMasterSchedule || (teamId === link.team_id && canAssignForTeam)) && (
                                        <TableCell>
                                          <div className="flex gap-1">
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditAssignment(entry)}><Pencil className="h-3 w-3" /></Button>
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeAssignment.mutate(entry)}><Trash2 className="h-3 w-3" /></Button>
                                          </div>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingEvent ? "Edit master schedule service" : "Add service to master schedule"}</DialogTitle></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); saveEvent.mutate(); }} className="space-y-4">
            <div className="space-y-1"><Label>Service name</Label><Input value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="Sunday Worship" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /></div>
              <div className="space-y-1"><Label>Time</Label><Input type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={eventDesc} onChange={(event) => setEventDesc(event.target.value)} placeholder="Optional details for team leaders" rows={3} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Required teams</Label><span className="text-xs text-muted-foreground">{selectedTeamIds.length} selected</span></div>
              <div className="grid grid-cols-2 gap-2 max-h-[190px] overflow-y-auto border rounded-md p-2">
                {teams.map((team: any) => (
                  <label key={team.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-1">
                    <Checkbox checked={selectedTeamIds.includes(team.id)} onCheckedChange={() => toggleTeamSelection(team.id)} />
                    {team.name}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saveEvent.isPending}>{saveEvent.isPending ? "Saving…" : "Save master schedule"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign member to {assignEvent?.name}</DialogTitle></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); assignVolunteer.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Team</Label>
              <Select value={assignTeamId} onValueChange={(value) => { setAssignTeamId(value); setAssignUserIds([]); setAssignRole(""); }} disabled={!!teamId}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {(assignEvent ? eventTeamsByEvent.get(assignEvent.id) || [] : []).map((link: any) => (
                    <SelectItem key={link.team_id} value={link.team_id}>{link.teams?.name || "Team"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Team members</Label>
                <span className="text-xs text-muted-foreground">{assignUserIds.length} selected</span>
              </div>
              {!assignTeamId ? (
                <p className="text-sm text-muted-foreground border rounded-md p-3">Select a team first</p>
              ) : (members as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground border rounded-md p-3">No members in this team.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[220px] overflow-y-auto border rounded-md p-2">
                  {(members as any[]).map((member) => {
                    const checked = assignUserIds.includes(member.user_id);
                    return (
                      <label key={member.user_id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-1">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => setAssignUserIds((current) => checked ? current.filter((id) => id !== member.user_id) : [...current, member.user_id])}
                        />
                        {member.profiles?.full_name || member.profiles?.email || "Unknown"}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Role / position (applied to all selected)</Label>
              {roleTypes.length > 0 ? (
                <Select value={assignRole || NO_ROLE_VALUE} onValueChange={(value) => setAssignRole(value === NO_ROLE_VALUE ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE_VALUE}>No role</SelectItem>
                    {roleTypes.map((role: any) => <SelectItem key={role.id} value={role.name}>{role.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : <Input value={assignRole} onChange={(event) => setAssignRole(event.target.value)} placeholder="e.g. Lead vocal, Sound board" />}
            </div>
            <Button type="submit" className="w-full" disabled={assignVolunteer.isPending || assignUserIds.length === 0 || !assignTeamId}>{assignVolunteer.isPending ? "Assigning…" : `Assign ${assignUserIds.length || ""} member${assignUserIds.length === 1 ? "" : "s"}`.trim()}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editAssignment} onOpenChange={(open) => !open && setEditAssignment(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit assignment</DialogTitle></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); updateAssignment.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Team member</Label>
              <Select value={editUserId} onValueChange={setEditUserId}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {(members as any[]).map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>{member.profiles?.full_name || "Unknown"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Role / position</Label>
              {roleTypes.length > 0 ? (
                <Select value={editRole || NO_ROLE_VALUE} onValueChange={(value) => setEditRole(value === NO_ROLE_VALUE ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE_VALUE}>No role</SelectItem>
                    {roleTypes.map((role: any) => <SelectItem key={role.id} value={role.name}>{role.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : <Input value={editRole} onChange={(event) => setEditRole(event.target.value)} />}
            </div>
            <Button type="submit" className="w-full" disabled={updateAssignment.isPending || !editUserId}>{updateAssignment.isPending ? "Saving…" : "Save assignment"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={runSheetOpen} onOpenChange={setRunSheetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create run sheet for {runSheetEvent?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Template</Label>
              <Select value={runSheetTemplateId} onValueChange={setRunSheetTemplateId}>
                <SelectTrigger><SelectValue placeholder="Pick a service template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((template: any) => (
                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && <p className="text-xs text-muted-foreground mt-1">Create an Order of Service template first.</p>}
            </div>
            <Button className="w-full" onClick={() => createRunSheet.mutate()} disabled={!runSheetTemplateId || createRunSheet.isPending}>
              {createRunSheet.isPending ? "Creating…" : "Create run sheet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
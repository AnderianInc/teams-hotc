import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Calendar, Trash2, UserPlus, Repeat, Pencil } from "lucide-react";
import { format, addWeeks, addMonths } from "date-fns";
import { useTeamRoleTypes } from "@/components/teams/TeamRoleTypeManager";
import { assertUserAvailableForRoster, getRosterResponseLabel } from "@/lib/rosterAvailability";

interface RosterEventManagerProps {
  teamId: string;
  teamName: string;
}

const NO_ROLE_VALUE = "__no_role__";

export default function RosterEventManager({ teamId, teamName }: RosterEventManagerProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState("4");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("");
  
  // Edit assignment state
  const [editAssignment, setEditAssignment] = useState<any>(null);
  const [editRole, setEditRole] = useState("");
  const [editUserId, setEditUserId] = useState("");

  // Also allow assigning additional teams to events
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [addTeamEventId, setAddTeamEventId] = useState("");
  const [addTeamId, setAddTeamId] = useState("");

  // Get events linked to this team via junction table
  const { data: events, isLoading } = useQuery({
    queryKey: ["roster-events", teamId],
    queryFn: async () => {
      const { data: junctions, error: jErr } = await supabase
        .from("roster_event_teams")
        .select("event_id")
        .eq("team_id", teamId);
      if (jErr) throw jErr;
      const eventIds = (junctions || []).map((j: any) => j.event_id);
      if (eventIds.length === 0) return [];

      const { data, error } = await supabase
        .from("roster_events")
        .select("*")
        .in("id", eventIds)
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Get all teams on each event
  const eventIds = (events || []).map((e: any) => e.id);
  const { data: eventTeams } = useQuery({
    queryKey: ["roster-event-teams", eventIds],
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

  const { data: members } = useQuery({
    queryKey: ["team-members-for-events", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("team_id", teamId);
      if (error) throw error;
      return data;
    },
  });

  const { data: allTeams } = useQuery({
    queryKey: ["all-teams-for-event-assign"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: roleTypes } = useTeamRoleTypes(teamId);

  // Get assignments for all events (scoped to this team)
  const { data: assignments } = useQuery({
    queryKey: ["roster-event-assignments", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roster_entries")
        .select("*, profiles:user_id(full_name, email)")
        .eq("team_id", teamId)
        .not("event_id", "is", null)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const createEvent = useMutation({
    mutationFn: async () => {
      if (!eventName || !eventDate) throw new Error("Name and date required");

      const dates: string[] = [eventDate];
      if (isRecurring) {
        const count = parseInt(recurrenceCount) || 4;
        const baseDate = new Date(eventDate + "T00:00:00");
        for (let i = 1; i < count; i++) {
          let next: Date;
          if (recurrenceType === "weekly") next = addWeeks(baseDate, i);
          else if (recurrenceType === "biweekly") next = addWeeks(baseDate, i * 2);
          else next = addMonths(baseDate, i);
          dates.push(format(next, "yyyy-MM-dd"));
        }
      }

      const eventRows = dates.map((d) => ({
        name: eventName,
        event_date: d,
        event_time: eventTime || null,
        description: eventDesc || null,
        team_id: null,
      }));

      const { data: created, error } = await supabase
        .from("roster_events")
        .insert(eventRows)
        .select("id");
      if (error) throw error;

      // Link to this team via junction
      const junctionRows = (created || []).map((evt: any) => ({
        event_id: evt.id,
        team_id: teamId,
      }));
      if (junctionRows.length > 0) {
        const { error: jErr } = await supabase.from("roster_event_teams").insert(junctionRows);
        if (jErr) throw jErr;
      }
    },
    onSuccess: () => {
      toast.success(isRecurring ? "Recurring events created!" : "Event created!");
      setCreateOpen(false);
      setEventName(""); setEventDate(""); setEventTime(""); setEventDesc("");
      setIsRecurring(false); setRecurrenceType("weekly"); setRecurrenceCount("4");
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

  const assignVolunteer = useMutation({
    mutationFn: async () => {
      if (!selectedEvent) throw new Error("No event selected");
      const member = members?.find((m: any) => m.user_id === assignUserId);
      const availabilityName = member?.profiles?.full_name || "This volunteer";
      await assertUserAvailableForRoster(assignUserId, selectedEvent.event_date, availabilityName);

      const { error } = await supabase.from("roster_entries").insert({
        team_id: teamId,
        user_id: assignUserId,
        scheduled_date: selectedEvent.event_date,
        role_description: assignRole || null,
        event_id: selectedEvent.id,
      });
      if (error) throw error;

      // Send notification email
      const memberEmail = member?.profiles?.email;
      const memberName = member?.profiles?.full_name || "Volunteer";

      if (memberEmail) {
        try {
          const eventDateFormatted = new Date(selectedEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric"
          });

          await supabase.functions.invoke("send-email", {
            body: {
              to: memberEmail,
              subject: `You've been assigned to: ${selectedEvent.name}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">Hi ${memberName},</h2>
                  <p>You've been assigned to an upcoming event with <strong>${teamName}</strong>.</p>
                  <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <p style="margin: 4px 0;"><strong>Event:</strong> ${selectedEvent.name}</p>
                    <p style="margin: 4px 0;"><strong>Date:</strong> ${eventDateFormatted}</p>
                    ${selectedEvent.event_time ? `<p style="margin: 4px 0;"><strong>Time:</strong> ${selectedEvent.event_time}</p>` : ""}
                    ${assignRole ? `<p style="margin: 4px 0;"><strong>Role:</strong> ${assignRole}</p>` : ""}
                  </div>
                  <p>— House of Transformation Church</p>
                </div>
              `,
            },
          });
        } catch (emailErr) {
          console.error("Failed to send notification:", emailErr);
        }
      }

      // In-app + push notification
      try {
        const dateStr = new Date(selectedEvent.event_date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric",
        });
        await supabase.functions.invoke("notify", {
          body: {
            recipient_id: assignUserId,
            type: "roster_assigned",
            title: `You've been assigned: ${selectedEvent.name}`,
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
      setAssignUserId(""); setAssignRole("");
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
      const assignment = (assignments || []).find((a: any) => a.id === id);
      const member = members?.find((m: any) => m.user_id === user_id);
      const date = assignment?.scheduled_date;
      if (date) await assertUserAvailableForRoster(user_id, date, member?.profiles?.full_name || "This volunteer");

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

  const addTeamToEvent = useMutation({
    mutationFn: async () => {
      if (!addTeamEventId || !addTeamId) throw new Error("Select event and team");
      const { error } = await supabase.from("roster_event_teams").insert({
        event_id: addTeamEventId,
        team_id: addTeamId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team added to event!");
      setAddTeamOpen(false);
      setAddTeamEventId(""); setAddTeamId("");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["roster-events", teamId] });
    queryClient.invalidateQueries({ queryKey: ["roster-event-teams"] });
    queryClient.invalidateQueries({ queryKey: ["roster-event-assignments", teamId] });
    queryClient.invalidateQueries({ queryKey: ["roster", teamId] });
    queryClient.invalidateQueries({ queryKey: ["roster-events-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-event-teams-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["roster-assignments-calendar"] });
  }

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const getEventAssignments = (eventId: string) =>
    (assignments || []).filter((a: any) => a.event_id === eventId);

  const getEventTeamNames = (eventId: string) =>
    (eventTeams || []).filter((et: any) => et.event_id === eventId);

  const today = format(new Date(), "yyyy-MM-dd");
  const upcomingEvents = (events || []).filter((e) => e.event_date >= today);
  const pastEvents = (events || []).filter((e) => e.event_date < today);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Events & Services</h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Event for {teamName}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createEvent.mutate(); }} className="space-y-4">
              <div className="space-y-1">
                <Label>Event Name</Label>
                <Input placeholder="e.g. Sunday Worship Service" value={eventName} onChange={(e) => setEventName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Time (optional)</Label>
                  <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description (optional)</Label>
                <Textarea placeholder="Event details..." value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} />
              </div>
              {/* Recurring */}
              <div className="flex items-center gap-2">
                <Checkbox id="recurring-team" checked={isRecurring} onCheckedChange={(v) => setIsRecurring(!!v)} />
                <Label htmlFor="recurring-team" className="flex items-center gap-1 cursor-pointer">
                  <Repeat className="h-4 w-4" /> Recurring event
                </Label>
              </div>
              {isRecurring && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div className="space-y-1">
                    <Label className="text-xs">Frequency</Label>
                    <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
      </div>

      {upcomingEvents.length === 0 && pastEvents.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No events yet. Create your first event to start assigning volunteers.
          </CardContent>
        </Card>
      )}

      {upcomingEvents.map((event) => {
        const eventAssignments = getEventAssignments(event.id);
        const evtTeams = getEventTeamNames(event.id);
        return (
          <Card key={event.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {event.name}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {new Date(event.event_date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric"
                      })}
                    </Badge>
                    {event.event_time && (
                      <Badge variant="outline" className="text-xs">{event.event_time}</Badge>
                    )}
                    {evtTeams.map((et: any) => (
                      <Badge key={et.team_id} variant="secondary" className="text-xs">
                        {(et.teams as any)?.name}
                      </Badge>
                    ))}
                  </div>
                  {event.description && (
                    <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedEvent(event); setAssignOpen(true); }}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Assign
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAddTeamEventId(event.id); setAddTeamOpen(true); }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Team
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteEvent.mutate(event.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {eventAssignments.length > 0 && (
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Volunteer</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventAssignments.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium text-sm">{a.profiles?.full_name || "Unknown"}</TableCell>
                        <TableCell>
                          {a.role_description ? (
                            <Badge variant="secondary" className="text-xs">{a.role_description}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => { setEditAssignment(a); setEditUserId(a.user_id); setEditRole(a.role_description || ""); }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeAssignment.mutate(a.id)}
                            >
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

      {pastEvents.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            Past events ({pastEvents.length})
          </summary>
          <div className="space-y-2 mt-2">
            {pastEvents.map((event) => (
              <Card key={event.id} className="opacity-60">
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{event.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(event.event_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getEventAssignments(event.id).length} assigned
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {/* Assign volunteer dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Volunteer to {selectedEvent?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); assignVolunteer.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Team Member</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select volunteer" />
                </SelectTrigger>
                <SelectContent>
                  {members?.filter((m: any) => m.user_id).map((m: any) => (
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
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleTypes.filter((rt) => rt.name && rt.name.trim()).map((rt) => (
                      <SelectItem key={rt.id} value={rt.name}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="e.g. Sound Board, Camera 1" value={assignRole} onChange={(e) => setAssignRole(e.target.value)} />
              )}
            </div>
            <Button type="submit" className="w-full" disabled={assignVolunteer.isPending || !assignUserId}>
              {assignVolunteer.isPending ? "Assigning..." : "Assign & Notify"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add team to event dialog */}
      <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team to Event</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addTeamToEvent.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Team</Label>
              <Select value={addTeamId} onValueChange={setAddTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team to add" />
                </SelectTrigger>
                <SelectContent>
                  {allTeams?.filter((t) => {
                    if (!t.id) return false;
                    const existing = (eventTeams || []).filter((et: any) => et.event_id === addTeamEventId).map((et: any) => et.team_id);
                    return !existing.includes(t.id);
                  }).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={addTeamToEvent.isPending || !addTeamId}>
              {addTeamToEvent.isPending ? "Adding..." : "Add Team"}
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
                  {members?.filter((m: any) => m.user_id).map((m: any) => (
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
                <Select value={editRole || NO_ROLE_VALUE} onValueChange={(value) => setEditRole(value === NO_ROLE_VALUE ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE_VALUE}>No role</SelectItem>
                    {roleTypes.filter((rt) => rt.name && rt.name.trim()).map((rt) => (
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
    </div>
  );
}

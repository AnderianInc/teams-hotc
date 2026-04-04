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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Calendar, Trash2, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { useTeamRoleTypes } from "@/components/teams/TeamRoleTypeManager";

interface RosterEventManagerProps {
  teamId: string;
  teamName: string;
}

export default function RosterEventManager({ teamId, teamName }: RosterEventManagerProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("");

  const { data: events, isLoading } = useQuery({
    queryKey: ["roster-events", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roster_events")
        .select("*")
        .eq("team_id", teamId)
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data;
    },
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

  const { data: roleTypes } = useTeamRoleTypes(teamId);

  // Get assignments for all events
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
      const { error } = await supabase.from("roster_events").insert({
        team_id: teamId,
        name: eventName,
        event_date: eventDate,
        event_time: eventTime || null,
        description: eventDesc || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event created!");
      setCreateOpen(false);
      setEventName(""); setEventDate(""); setEventTime(""); setEventDesc("");
      queryClient.invalidateQueries({ queryKey: ["roster-events", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from("roster_events").delete().eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted");
      queryClient.invalidateQueries({ queryKey: ["roster-events", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster-event-assignments", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignVolunteer = useMutation({
    mutationFn: async () => {
      if (!selectedEvent) throw new Error("No event selected");
      
      // Insert roster entry linked to event
      const { error } = await supabase.from("roster_entries").insert({
        team_id: teamId,
        user_id: assignUserId,
        scheduled_date: selectedEvent.event_date,
        role_description: assignRole || null,
        event_id: selectedEvent.id,
      });
      if (error) throw error;

      // Send notification email
      const member = members?.find((m: any) => m.user_id === assignUserId);
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
                    ${selectedEvent.description ? `<p style="margin: 4px 0;"><strong>Details:</strong> ${selectedEvent.description}</p>` : ""}
                  </div>
                  <p>Please make sure you're available for this event. If you have any questions, reach out to your team lead.</p>
                  <p style="color: #666;">— House of Transformation Church</p>
                </div>
              `,
            },
          });
        } catch (emailErr) {
          console.error("Failed to send notification:", emailErr);
        }
      }
    },
    onSuccess: () => {
      toast.success("Volunteer assigned & notified!");
      setAssignOpen(false);
      setAssignUserId(""); setAssignRole("");
      queryClient.invalidateQueries({ queryKey: ["roster-event-assignments", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster-calendar"] });
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
      queryClient.invalidateQueries({ queryKey: ["roster-event-assignments", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster", teamId] });
      queryClient.invalidateQueries({ queryKey: ["roster-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const getEventAssignments = (eventId: string) =>
    (assignments || []).filter((a: any) => a.event_id === eventId);

  // Split events into upcoming and past
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
              <Button type="submit" className="w-full" disabled={createEvent.isPending}>
                {createEvent.isPending ? "Creating..." : "Create Event"}
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
        return (
          <Card key={event.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {event.name}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {new Date(event.event_date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric"
                      })}
                    </Badge>
                    {event.event_time && (
                      <Badge variant="outline" className="text-xs">{event.event_time}</Badge>
                    )}
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
                      <TableHead className="w-[60px]"></TableHead>
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
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeAssignment.mutate(a.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
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
                <Select value={assignRole} onValueChange={setAssignRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleTypes.map((rt) => (
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
    </div>
  );
}

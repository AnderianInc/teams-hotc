import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Pencil, Plus, Trash2, MapPin } from "lucide-react";
import { format, isPast } from "date-fns";
import { toast } from "sonner";

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

type Record = {
  id: string;
  source: string;
  attendee_id: string | null;
  event_date: string | null;
  received_at: string;
  payload: any;
};

type Meeting = {
  id: string;
  meeting_date: string;
  title: string | null;
  location: string | null;
  notes: string | null;
};

const emptyForm = { meeting_date: "", title: "", location: "", notes: "" };

export default function InterestMeetings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ date: string; ids: string[] } | null>(null);
  const [newDate, setNewDate] = useState("");
  const [meetingDialog, setMeetingDialog] = useState<{ mode: "create" | "edit"; meeting?: Meeting } | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: records = [] } = useQuery({
    queryKey: ["interest-meeting-records"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_records")
        .select("id, source, attendee_id, event_date, received_at, payload")
        .eq("source", "interest")
        .in("status", ["created", "merged"])
        .order("event_date", { ascending: true });
      if (error) throw error;
      return (data || []) as Record[];
    },
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["interest-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interest_meetings" as any)
        .select("id, meeting_date, title, location, notes")
        .order("meeting_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Meeting[];
    },
  });

  const meetingByDate = useMemo(() => {
    const m = new Map<string, Meeting>();
    for (const x of meetings) m.set(x.meeting_date, x);
    return m;
  }, [meetings]);

  const grouped = useMemo(() => {
    const map = new Map<string, Record[]>();
    // seed with catalog meetings (empty groups still display)
    for (const m of meetings) map.set(m.meeting_date, []);
    for (const r of records) {
      const key = r.event_date || "unscheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [records, meetings]);

  const reschedule = useMutation({
    mutationFn: async ({ ids, date }: { ids: string[]; date: string | null }) => {
      const { error } = await supabase
        .from("external_records")
        .update({ event_date: date })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendees updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["interest-meeting-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMeeting = useMutation({
    mutationFn: async () => {
      if (!form.meeting_date) throw new Error("Meeting date is required");
      const payload = {
        meeting_date: form.meeting_date,
        title: form.title || null,
        location: form.location || null,
        notes: form.notes || null,
      };
      if (meetingDialog?.mode === "edit" && meetingDialog.meeting) {
        const oldDate = meetingDialog.meeting.meeting_date;
        const { error } = await supabase
          .from("interest_meetings" as any)
          .update(payload)
          .eq("id", meetingDialog.meeting.id);
        if (error) throw error;
        // If the date changed, re-anchor attendees that were on the old date
        if (oldDate !== form.meeting_date) {
          await supabase
            .from("external_records")
            .update({ event_date: form.meeting_date })
            .eq("source", "interest")
            .eq("event_date", oldDate);
        }
      } else {
        const { error } = await supabase.from("interest_meetings" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Meeting saved");
      setMeetingDialog(null);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["interest-meetings"] });
      qc.invalidateQueries({ queryKey: ["interest-meeting-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMeeting = useMutation({
    mutationFn: async (meeting: Meeting) => {
      // Move any attached attendees to unscheduled, then delete the catalog row
      await supabase
        .from("external_records")
        .update({ event_date: null })
        .eq("source", "interest")
        .eq("event_date", meeting.meeting_date);
      const { error } = await supabase
        .from("interest_meetings" as any)
        .delete()
        .eq("id", meeting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meeting deleted");
      qc.invalidateQueries({ queryKey: ["interest-meetings"] });
      qc.invalidateQueries({ queryKey: ["interest-meeting-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setMeetingDialog({ mode: "create" });
  };
  const openEdit = (m: Meeting) => {
    setForm({
      meeting_date: m.meeting_date,
      title: m.title || "",
      location: m.location || "",
      notes: m.notes || "",
    });
    setMeetingDialog({ mode: "edit", meeting: m });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Interest Meetings</h2>
          <Badge variant="outline">{records.length} attendees</Badge>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Meeting
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Create meeting dates here so attendees can be slotted in. Reschedule a whole meeting and outreach
        reminders re-anchor automatically. Deleting a meeting moves its attendees back to Unscheduled.
      </p>

      {grouped.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No interest meetings yet — click <strong>New Meeting</strong> to add one.</CardContent></Card>
      )}

      {grouped.map(([date, items]) => {
        const isUnscheduled = date === "unscheduled";
        const meeting = isUnscheduled ? undefined : meetingByDate.get(date);
        const past = !isUnscheduled && isPast(parseLocalDate(date));
        return (
          <Card key={date}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  {isUnscheduled ? "Unscheduled" : format(parseLocalDate(date), "EEEE, MMM d, yyyy")}
                  {meeting?.title && <span className="text-sm font-normal text-muted-foreground">— {meeting.title}</span>}
                  {past && <Badge variant="secondary">past</Badge>}
                  {!isUnscheduled && !meeting && <Badge variant="outline" className="text-xs">not in catalog</Badge>}
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{items.length} attending</span>
                  {meeting?.location && (
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {meeting.location}</span>
                  )}
                </div>
                {meeting?.notes && <p className="text-xs text-muted-foreground mt-1">{meeting.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                {!isUnscheduled && (
                  <Button size="sm" variant="outline" onClick={() => { setEditing({ date, ids: items.map((i) => i.id) }); setNewDate(date); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Move attendees
                  </Button>
                )}
                {meeting && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openEdit(meeting)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => confirm(`Delete this meeting? Attendees will move to Unscheduled.`) && deleteMeeting.mutate(meeting)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            {items.length > 0 && (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Registered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.payload?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{r.payload?.email || "—"}</TableCell>
                        <TableCell className="text-xs">{r.payload?.phone || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(r.received_at), "MMM d, h:mm a")}
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

      {/* Reschedule attendees dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move attendees to a different date</DialogTitle>
            <DialogDescription>
              Updates {editing?.ids.length || 0} attendee{editing?.ids.length === 1 ? "" : "s"} to a new date.
            </DialogDescription>
          </DialogHeader>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => editing && reschedule.mutate({ ids: editing.ids, date: null })} disabled={reschedule.isPending}>
              Move to unscheduled
            </Button>
            <Button onClick={() => editing && newDate && reschedule.mutate({ ids: editing.ids, date: newDate })} disabled={reschedule.isPending || !newDate}>
              Save new date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit meeting dialog */}
      <Dialog open={!!meetingDialog} onOpenChange={(o) => { if (!o) { setMeetingDialog(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{meetingDialog?.mode === "edit" ? "Edit meeting" : "New interest meeting"}</DialogTitle>
            <DialogDescription>
              Create or update a meeting date that attendees can be assigned to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={form.meeting_date} onChange={(e) => setForm((f) => ({ ...f, meeting_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Title (optional)</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Newcomer Lunch" />
            </div>
            <div className="space-y-1">
              <Label>Location (optional)</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMeetingDialog(null); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={() => saveMeeting.mutate()} disabled={saveMeeting.isPending || !form.meeting_date}>
              {saveMeeting.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

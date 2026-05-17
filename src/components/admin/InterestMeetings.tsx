import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Pencil } from "lucide-react";
import { format, isPast } from "date-fns";
import { toast } from "sonner";

// Parse YYYY-MM-DD as a local-time date to avoid UTC→local shifting it back a day
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

export default function InterestMeetings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ date: string; ids: string[] } | null>(null);
  const [newDate, setNewDate] = useState("");

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

  const grouped = useMemo(() => {
    const map = new Map<string, Record[]>();
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
  }, [records]);

  const reschedule = useMutation({
    mutationFn: async ({ ids, date }: { ids: string[]; date: string | null }) => {
      const { error } = await supabase
        .from("external_records")
        .update({ event_date: date })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meeting updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["interest-meeting-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Interest Meetings</h2>
        <Badge variant="outline">{records.length} attendees</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Each meeting groups people who picked the same preferred date when they registered interest.
        Reschedule a whole meeting if the date changes — outreach reminders re-anchor automatically.
      </p>

      {grouped.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No interest meeting registrations yet</CardContent></Card>
      )}

      {grouped.map(([date, items]) => {
        const isUnscheduled = date === "unscheduled";
        const past = !isUnscheduled && isPast(new Date(date));
        return (
          <Card key={date}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {isUnscheduled ? "Unscheduled" : format(new Date(date), "EEEE, MMM d, yyyy")}
                  {past && <Badge variant="secondary">past</Badge>}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{items.length} attending</p>
              </div>
              {!isUnscheduled && (
                <Button size="sm" variant="outline" onClick={() => { setEditing({ date, ids: items.map((i) => i.id) }); setNewDate(date); }}>
                  <Pencil className="h-3 w-3 mr-1" /> Reschedule
                </Button>
              )}
            </CardHeader>
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
          </Card>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule meeting</DialogTitle>
            <DialogDescription>
              Updates the event date for {editing?.ids.length || 0} attendee{editing?.ids.length === 1 ? "" : "s"}.
              All upcoming reminders re-anchor to the new date.
            </DialogDescription>
          </DialogHeader>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => editing && reschedule.mutate({ ids: editing.ids, date: null })}
              disabled={reschedule.isPending}
            >
              Move to unscheduled
            </Button>
            <Button
              onClick={() => editing && newDate && reschedule.mutate({ ids: editing.ids, date: newDate })}
              disabled={reschedule.isPending || !newDate}
            >
              Save new date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

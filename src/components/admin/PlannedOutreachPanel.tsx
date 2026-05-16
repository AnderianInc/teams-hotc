import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarClock, PlayCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

const SRC_LABEL: Record<string, string> = { prayer: "Prayer", visit: "Visit", interest: "Interest" };

type Sequence = {
  id: string;
  source: "prayer" | "visit" | "interest";
  step_order: number;
  offset_days: number;
  anchor: "received" | "event_date";
  channel: "email" | "sms" | "task";
  template_slug: string | null;
  audience: "requester" | "fi_team";
  description: string | null;
  active: boolean;
};

export default function PlannedOutreachPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: sequences = [] } = useQuery({
    queryKey: ["outreach-sequences-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sequences")
        .select("*")
        .order("source")
        .order("step_order");
      if (error) throw error;
      return (data || []) as Sequence[];
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["external-records-active"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_records")
        .select("id, source, attendee_id, received_at, event_date, payload, status")
        .in("status", ["created", "merged"])
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["outreach-runs"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sequence_runs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const runKey = (recId: string, seqId: string) => `${recId}:${seqId}`;
  const ranMap = useMemo(() => {
    const m = new Map<string, any>();
    runs.forEach((r: any) => m.set(runKey(r.external_record_id, r.sequence_id), r));
    return m;
  }, [runs]);

  // Build planned list
  const planned = useMemo(() => {
    const rows: Array<{
      recordId: string;
      source: string;
      name: string;
      seq: Sequence;
      dueAt: number;
      ran?: any;
    }> = [];
    for (const rec of records as any[]) {
      const seqs = sequences.filter((s) => s.source === rec.source && s.active);
      for (const seq of seqs) {
        const anchor = seq.anchor === "event_date" ? rec.event_date : rec.received_at;
        if (!anchor) continue;
        const dueAt = new Date(anchor).getTime() + seq.offset_days * 86400000;
        rows.push({
          recordId: rec.id,
          source: rec.source,
          name: rec.payload?.name || "—",
          seq,
          dueAt,
          ran: ranMap.get(runKey(rec.id, seq.id)),
        });
      }
    }
    return rows.sort((a, b) => a.dueAt - b.dueAt);
  }, [records, sequences, ranMap]);

  const now = Date.now();
  const upcoming = planned.filter((p) => !p.ran && p.dueAt > now);
  const dueNow = planned.filter((p) => !p.ran && p.dueAt <= now);
  const completed = planned.filter((p) => p.ran);

  const runNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("outreach-dispatch", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Dispatched ${d?.dispatched ?? 0}, skipped ${d?.skipped ?? 0}`);
      qc.invalidateQueries({ queryKey: ["outreach-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSeq = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("outreach_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Step removed");
      qc.invalidateQueries({ queryKey: ["outreach-sequences-full"] });
      qc.invalidateQueries({ queryKey: ["outreach-sequences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderRow = (p: typeof planned[number]) => (
    <TableRow key={`${p.recordId}-${p.seq.id}`}>
      <TableCell><Badge variant="outline">{SRC_LABEL[p.source]}</Badge></TableCell>
      <TableCell className="font-medium">{p.name}</TableCell>
      <TableCell className="text-xs">{p.seq.description || p.seq.template_slug}</TableCell>
      <TableCell><Badge variant="secondary" className="text-xs">{p.seq.channel}</Badge></TableCell>
      <TableCell className="text-xs text-muted-foreground">{p.seq.audience}</TableCell>
      <TableCell className="text-xs">
        {format(new Date(p.dueAt), "MMM d, h:mm a")}
        <span className="text-muted-foreground"> ({formatDistanceToNow(new Date(p.dueAt), { addSuffix: true })})</span>
      </TableCell>
      <TableCell>
        {p.ran ? (
          <Badge variant={p.ran.status === "sent" ? "default" : p.ran.status === "failed" ? "destructive" : "outline"}>
            {p.ran.status}
          </Badge>
        ) : p.dueAt <= now ? (
          <Badge variant="destructive">due</Badge>
        ) : (
          <Badge variant="outline">scheduled</Badge>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Planned outreach
          </CardTitle>
          <Button size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            <PlayCircle className={`h-4 w-4 mr-2 ${runNow.isPending ? "animate-pulse" : ""}`} />
            Run dispatcher now
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="due">
            <TabsList>
              <TabsTrigger value="due">Due now ({dueNow.length})</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
            </TabsList>
            {(["due", "upcoming", "completed"] as const).map((key) => {
              const list = key === "due" ? dueNow : key === "upcoming" ? upcoming : completed;
              return (
                <TabsContent key={key} value={key}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Step</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Audience</TableHead>
                        <TableHead>{key === "completed" ? "Sent" : "Scheduled"}</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.slice(0, 200).map(renderRow)}
                      {list.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nothing here</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Automation steps</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" /> New step
              </Button>
            </DialogTrigger>
            <NewStepDialog
              existingSteps={sequences}
              onDone={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["outreach-sequences-full"] });
                qc.invalidateQueries({ queryKey: ["outreach-sequences"] });
              }}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Offset (d)</TableHead>
                <TableHead>Anchor</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sequences.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Badge variant="outline">{SRC_LABEL[s.source]}</Badge></TableCell>
                  <TableCell>{s.step_order}</TableCell>
                  <TableCell className="text-xs">{s.description || s.template_slug}</TableCell>
                  <TableCell>{s.channel}</TableCell>
                  <TableCell>{s.audience}</TableCell>
                  <TableCell>{s.offset_days}</TableCell>
                  <TableCell className="text-xs">{s.anchor}</TableCell>
                  <TableCell>{s.active ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remove this automation step?")) removeSeq.mutate(s.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NewStepDialog({
  existingSteps,
  onDone,
}: {
  existingSteps: Sequence[];
  onDone: () => void;
}) {
  const [source, setSource] = useState<"prayer" | "visit" | "interest">("interest");
  const [channel, setChannel] = useState<"email" | "sms" | "task">("email");
  const [audience, setAudience] = useState<"requester" | "fi_team">("requester");
  const [anchor, setAnchor] = useState<"received" | "event_date">("received");
  const [offset, setOffset] = useState(1);
  const [description, setDescription] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");

  const nextOrder = (existingSteps.filter((s) => s.source === source).reduce((m, s) => Math.max(m, s.step_order), 0)) + 1;

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("outreach_sequences").insert({
        source,
        step_order: nextOrder,
        offset_days: offset,
        anchor,
        channel,
        template_slug: templateSlug || null,
        audience,
        description: description || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Automation step created");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New automation step</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Source</Label>
          <Select value={source} onValueChange={(v: any) => setSource(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prayer">Prayer</SelectItem>
              <SelectItem value="visit">Visit</SelectItem>
              <SelectItem value="interest">Interest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Channel</Label>
          <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="task">Task</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Audience</Label>
          <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="requester">Requester</SelectItem>
              <SelectItem value="fi_team">FI team</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Anchor</Label>
          <Select value={anchor} onValueChange={(v: any) => setAnchor(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="received">Received date</SelectItem>
              <SelectItem value="event_date">Event date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Offset (days from anchor; negative = before)</Label>
          <Input type="number" value={offset} onChange={(e) => setOffset(parseInt(e.target.value, 10) || 0)} />
        </div>
        <div>
          <Label>Template slug</Label>
          <Input value={templateSlug} onChange={(e) => setTemplateSlug(e.target.value)} placeholder="interest-ack-email" />
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Friendly description" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>Create step</Button>
      </DialogFooter>
    </DialogContent>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarClock, PlayCircle, Plus, Trash2, Check, X, ShieldAlert, Pencil, Tag } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { useChurchTimezone, formatInChurchTz } from "@/lib/timezone";
import { useTableFilters } from "@/hooks/useTableFilters";
import { FilterChips } from "@/components/filters/FilterChips";
import { FilterPopover } from "@/components/filters/FilterPopover";
import { ActiveFilterBar } from "@/components/filters/ActiveFilterBar";
import { Search } from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "prayer", label: "Prayer" },
  { value: "visit", label: "Visit" },
  { value: "interest", label: "Interest" },
];
const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "task", label: "Task" },
];
const AUDIENCE_OPTIONS = [
  { value: "requester", label: "Requester" },
  { value: "fi_team", label: "FI team" },
];

const SEND_HOUR = 9;

function computeScheduledFor(
  anchorKind: "received" | "event_date",
  anchorValue: string,
  offsetDays: number,
  tz: string,
): number {
  if (anchorKind === "event_date") {
    const [y, m, d] = anchorValue.split("-").map(Number);
    if (!y || !m || !d) return new Date(anchorValue).getTime();
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() + offsetDays);
    const yy = base.getUTCFullYear();
    const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(base.getUTCDate()).padStart(2, "0");
    const hh = String(SEND_HOUR).padStart(2, "0");
    return fromZonedTime(`${yy}-${mm}-${dd} ${hh}:00:00`, tz).getTime();
  }
  return new Date(anchorValue).getTime() + offsetDays * 86400000;
}

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
  requires_approval: boolean;
  subject_override: string | null;
  body_override: string | null;
};

function applyVars(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => ctx[k] ?? "");
}

type Run = {
  id: string;
  external_record_id: string;
  sequence_id: string;
  status: "sent" | "skipped" | "failed" | "pending_approval" | "approved";
  detail: string | null;
  sent_at: string;
  scheduled_for: string | null;
  subject: string | null;
  body: string | null;
  recipient: string | null;
  channel: string | null;
  approved_at: string | null;
  approved_by: string | null;
};

// Template registry mirrored from edge function for preview only
const TEMPLATES: Record<string, { subject: string; body: string }> = {
  "prayer-alert-fi": { subject: "New prayer request received", body: "A new prayer request has come in from {{first_name}}.\n\nDetails: {{notes}}\n\nPlease follow up promptly." },
  "prayer-ack-requester": { subject: "We're praying for you", body: "Hi {{first_name}}, we received your prayer request and our team is praying for you. — HOTC" },
  "prayer-checkin-d3": { subject: "Checking in", body: "Hi {{first_name}}, just checking in — still praying with you. Anything we can help with? — HOTC" },
  "prayer-invite-meeting": { subject: "You're invited to our prayer meeting", body: "Hi {{first_name}},\n\nWe'd love to have you join our next prayer gathering. Reply to this email for details.\n\n— HOTC" },
  "visit-ack-requester": { subject: "Thank you for requesting a visit", body: "Hi {{first_name}},\n\nWe received your visit request and a member of our team will be in touch shortly to coordinate.\n\n— HOTC" },
  "visit-alert-fi": { subject: "New visit request received", body: "A visit request from {{first_name}} just arrived. Please coordinate pickup/visit details.\n\nNotes: {{notes}}" },
  "visit-pickup-confirm": { subject: "Pickup confirmation", body: "Hi {{first_name}}, this is HOTC confirming your visit. We'll send pickup details shortly." },
  "interest-ack-sms": { subject: "Interest meeting confirmed", body: "Hi {{first_name}}, you're confirmed for our interest meeting on {{event_date}}. — HOTC" },
  "interest-ack-email": { subject: "Interest meeting confirmed", body: "Hi {{first_name}},\n\nThanks for your interest! You're confirmed for our meeting on {{event_date}}. We'll send reminders as the date approaches.\n\n— HOTC" },
  "interest-reminder-7d": { subject: "1 week until our meeting", body: "Hi {{first_name}}, just a heads-up — your interest meeting is one week away ({{event_date}})." },
  "interest-reminder-2d": { subject: "2 days to go", body: "Hi {{first_name}}, your interest meeting is in 2 days ({{event_date}})." },
  "interest-reminder-1d-email": { subject: "Tomorrow's meeting", body: "Hi {{first_name}}, looking forward to seeing you tomorrow ({{event_date}})." },
  "interest-reminder-1d-sms": { subject: "Tomorrow", body: "Hi {{first_name}}, see you tomorrow ({{event_date}})! — HOTC" },
  "interest-day-of-email": { subject: "Today's the day", body: "Hi {{first_name}}, looking forward to seeing you today. — HOTC" },
  "interest-day-of-sms": { subject: "Today", body: "Hi {{first_name}}, see you today! — HOTC" },
};

export default function PlannedOutreachPanel() {
  const qc = useQueryClient();
  const { timezone: churchTz } = useChurchTimezone();
  const [open, setOpen] = useState(false);
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [editingSeq, setEditingSeq] = useState<Sequence | null>(null);
  const [previewPlanned, setPreviewPlanned] = useState<{ recordId: string; seqId: string; dueAt: number } | null>(null);

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
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sequence_runs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as Run[];
    },
  });

  const runByKey = useMemo(() => {
    const m = new Map<string, Run>();
    runs.forEach((r) => m.set(`${r.external_record_id}:${r.sequence_id}`, r));
    return m;
  }, [runs]);

  const planned = useMemo(() => {
    const rows: Array<{ recordId: string; source: string; name: string; seq: Sequence; dueAt: number; ran?: Run }> = [];
    for (const rec of records as any[]) {
      const seqs = sequences.filter((s) => s.source === rec.source && s.active);
      for (const seq of seqs) {
        const anchor = seq.anchor === "event_date" ? rec.event_date : rec.received_at;
        if (!anchor) continue;
        const dueAt = computeScheduledFor(seq.anchor, anchor, seq.offset_days, churchTz);
        rows.push({
          recordId: rec.id,
          source: rec.source,
          name: rec.payload?.name || "—",
          seq,
          dueAt,
          ran: runByKey.get(`${rec.id}:${seq.id}`),
        });
      }
    }
    return rows.sort((a, b) => a.dueAt - b.dueAt);
  }, [records, sequences, runByKey, churchTz]);

  const now = Date.now();
  const pendingApproval = runs.filter((r) => r.status === "pending_approval");
  const approvedScheduled = runs.filter((r) => r.status === "approved");
  const skippedRuns = runs.filter((r) => r.status === "skipped");
  const failedRuns = runs.filter((r) => r.status === "failed");
  const upcoming = planned.filter((p) => !p.ran && p.dueAt > now);
  const dueNow = planned.filter((p) => !p.ran && p.dueAt <= now);
  const completed = planned.filter((p) => p.ran && p.ran.status === "sent");

  const runDispatcher = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("outreach-dispatch", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      const q = d?.queued ?? 0;
      toast.success(
        `Sent ${d?.dispatched ?? 0} · ${q} waiting for review${q ? " (see 'Needs review' tab)" : ""} · ${d?.skipped ?? 0} skipped`,
      );
      qc.invalidateQueries({ queryKey: ["outreach-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ run_id, action, reason }: { run_id: string; action: "approve" | "reject"; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke("outreach-approve", { body: { run_id, action, reason } });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any, vars) => {
      if (vars.action === "approve") {
        toast.success(d?.status === "approved" ? "Approved — will send at scheduled time" : `Sent (${d?.status})`);
      } else {
        toast.success("Rejected");
      }
      setReviewRunId(null);
      qc.invalidateQueries({ queryKey: ["outreach-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleApproval = useMutation({
    mutationFn: async ({ id, requires_approval }: { id: string; requires_approval: boolean }) => {
      const { error } = await supabase.from("outreach_sequences").update({ requires_approval }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach-sequences-full"] }),
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seqById = useMemo(() => new Map(sequences.map((s) => [s.id, s])), [sequences]);
  const recById = useMemo(() => new Map((records as any[]).map((r) => [r.id, r])), [records]);
  const activeRun = reviewRunId ? runs.find((r) => r.id === reviewRunId) : null;

  useEffect(() => {
    if (activeRun) {
      setEditSubject(activeRun.subject || "");
      setEditBody(activeRun.body || "");
    }
  }, [activeRun?.id]);

  const saveRunEdits = useMutation({
    mutationFn: async ({ run_id, subject, body }: { run_id: string; subject: string; body: string }) => {
      const { error } = await supabase
        .from("outreach_sequence_runs")
        .update({ subject, body })
        .eq("id", run_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Message updated");
      qc.invalidateQueries({ queryKey: ["outreach-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isEdited = !!activeRun && (editSubject !== (activeRun.subject || "") || editBody !== (activeRun.body || ""));

  const statusBadge = (s: Run["status"]) => {
    if (s === "sent") return <Badge>sent</Badge>;
    if (s === "failed") return <Badge variant="destructive">failed</Badge>;
    if (s === "pending_approval") return <Badge variant="secondary">needs approval</Badge>;
    if (s === "approved") return <Badge variant="secondary">approved · scheduled</Badge>;
    return <Badge variant="outline">skipped</Badge>;
  };

  const renderPlannedRow = (p: typeof planned[number]) => (
    <TableRow
      key={`${p.recordId}-${p.seq.id}`}
      className="cursor-pointer hover:bg-muted/50"
      onClick={() =>
        p.ran
          ? setReviewRunId(p.ran.id)
          : setPreviewPlanned({ recordId: p.recordId, seqId: p.seq.id, dueAt: p.dueAt })
      }
    >
      <TableCell><Badge variant="outline">{SRC_LABEL[p.source]}</Badge></TableCell>
      <TableCell className="font-medium">{p.name}</TableCell>
      <TableCell className="text-xs">{p.seq.description || p.seq.template_slug}</TableCell>
      <TableCell><Badge variant="secondary" className="text-xs">{p.seq.channel}</Badge></TableCell>
      <TableCell className="text-xs text-muted-foreground">{p.seq.audience}</TableCell>
      <TableCell className="text-xs">
        {formatInChurchTz(p.dueAt, "MMM d, h:mm a", churchTz)}{" "}
        <span className="text-muted-foreground">({formatDistanceToNow(new Date(p.dueAt), { addSuffix: true })})</span>
      </TableCell>
      <TableCell>
        {p.ran
          ? statusBadge(p.ran.status)
          : p.dueAt <= now
            ? (p.seq.requires_approval
                ? <Badge variant="secondary" title="Run the dispatcher to queue for review">due · will need review</Badge>
                : <Badge variant="destructive" title="Run the dispatcher to send">due · will auto-send</Badge>)
            : <Badge variant="outline">scheduled</Badge>}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      {pendingApproval.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <span className="font-medium">{pendingApproval.length} outreach message{pendingApproval.length === 1 ? "" : "s"} waiting for your review.</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Planned outreach
          </CardTitle>
          <Button size="sm" onClick={() => runDispatcher.mutate()} disabled={runDispatcher.isPending}>
            <PlayCircle className={`h-4 w-4 mr-2 ${runDispatcher.isPending ? "animate-pulse" : ""}`} />
            Run dispatcher now
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={pendingApproval.length > 0 ? "pending" : "due"}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="pending">Needs review ({pendingApproval.length})</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length + approvedScheduled.length})</TabsTrigger>
              <TabsTrigger value="due">Due now ({dueNow.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
              <TabsTrigger value="skipped">Skipped ({skippedRuns.length})</TabsTrigger>
              <TabsTrigger value="failed">Failed ({failedRuns.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
                These items have been pre-queued for your review <strong>before</strong> their scheduled send time.
                Approve to schedule the send; the dispatcher will deliver at the scheduled time (or immediately if already past).
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Subject / preview</TableHead>
                    <TableHead>Scheduled send</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApproval.map((r) => {
                    const seq = seqById.get(r.sequence_id);
                    const rec = recById.get(r.external_record_id);
                    const sched = r.scheduled_for ? new Date(r.scheduled_for) : null;
                    return (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setReviewRunId(r.id)}>
                        <TableCell><Badge variant="outline">{SRC_LABEL[seq?.source || ""] || seq?.source}</Badge></TableCell>
                        <TableCell className="font-medium">
                          {rec?.payload?.name || "—"}
                          <div className="text-xs text-muted-foreground">{r.recipient}</div>
                        </TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{r.channel}</Badge></TableCell>
                        <TableCell className="text-xs max-w-[420px] truncate">
                          <span className="font-medium">{r.subject}</span> — {r.body?.slice(0, 100)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {sched ? (
                            <>
                              {formatInChurchTz(sched, "MMM d, h:mm a", churchTz)}
                              <div className="text-muted-foreground">{formatDistanceToNow(sched, { addSuffix: true })}</div>
                            </>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setReviewRunId(r.id); }}>Review</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {pendingApproval.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nothing waiting</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            {(["due", "upcoming", "completed"] as const).map((key) => {
              const list = key === "due" ? dueNow : key === "upcoming" ? upcoming : completed;
              return (
                <TabsContent key={key} value={key}>
                  {key === "due" && list.length > 0 && (
                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
                      These items are <strong>past their scheduled time</strong> and have not yet been queued.
                      Click <em>Run dispatcher now</em> to queue approval-required steps for review and auto-send the rest.
                    </div>
                  )}
                  {key === "upcoming" && approvedScheduled.length > 0 && (
                    <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs">
                      <strong>{approvedScheduled.length}</strong> approved message{approvedScheduled.length === 1 ? " is" : "s are"} scheduled and will send automatically at the planned time.
                    </div>
                  )}
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
                      {list.slice(0, 200).map(renderPlannedRow)}
                      {list.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nothing here</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              );
            })}

            {(["skipped", "failed"] as const).map((key) => {
              const list = key === "skipped" ? skippedRuns : failedRuns;
              return (
                <TabsContent key={key} value={key}>
                  <p className="text-xs text-muted-foreground mb-2">
                    {key === "skipped"
                      ? "Steps the dispatcher reached but did not send — usually missing email, missing phone, or no SMS opt-in. Fix the underlying contact and re-run."
                      : "Steps that errored while sending. Click a row to see the error detail."}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Step</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((r) => {
                        const seq = seqById.get(r.sequence_id);
                        const rec: any = recById.get(r.external_record_id);
                        return (
                          <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setReviewRunId(r.id)}>
                            <TableCell><Badge variant="outline">{SRC_LABEL[seq?.source || ""] || seq?.source || "—"}</Badge></TableCell>
                            <TableCell className="font-medium">
                              {rec?.payload?.name || "—"}
                              <div className="text-xs text-muted-foreground">{r.recipient || "no recipient"}</div>
                            </TableCell>
                            <TableCell><Badge variant="secondary" className="text-xs">{r.channel || seq?.channel}</Badge></TableCell>
                            <TableCell className="text-xs">{seq?.description || seq?.template_slug || "—"}</TableCell>
                            <TableCell className="text-xs max-w-[320px] truncate">{r.detail || "—"}</TableCell>
                            <TableCell className="text-xs">{formatDistanceToNow(new Date(r.sent_at), { addSuffix: true })}</TableCell>
                          </TableRow>
                        );
                      })}
                      {list.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nothing here</TableCell></TableRow>
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
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> New step</Button>
            </DialogTrigger>
            <NewStepDialog
              existingSteps={sequences}
              onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["outreach-sequences-full"] }); }}
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
                <TableHead>Offset</TableHead>
                <TableHead>Anchor</TableHead>
                <TableHead>Review before send</TableHead>
                <TableHead>Template</TableHead>
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
                  <TableCell>{s.offset_days}d</TableCell>
                  <TableCell className="text-xs">{s.anchor}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.requires_approval}
                      onCheckedChange={(v) => toggleApproval.mutate({ id: s.id, requires_approval: v })}
                    />
                  </TableCell>
                  <TableCell>
                    {s.template_slug && TEMPLATES[s.template_slug] ? (
                      <Button size="sm" variant="ghost" onClick={() => setPreviewSlug(s.template_slug)}>Preview</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditingSeq(s)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remove this step?")) removeSeq.mutate(s.id); }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review dialog */}
      <Dialog open={!!reviewRunId} onOpenChange={(o) => !o && setReviewRunId(null)}>
        <DialogContent className="max-w-2xl">
          {activeRun && (() => {
            const seq = seqById.get(activeRun.sequence_id);
            const rec = recById.get(activeRun.external_record_id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{activeRun.subject || "Outreach message"}</DialogTitle>
                  <DialogDescription>
                    {SRC_LABEL[seq?.source || ""] || seq?.source} · {activeRun.channel} · to {activeRun.recipient || "—"}
                    {rec?.payload?.name ? ` (${rec.payload.name})` : ""}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Step: {seq?.description || seq?.template_slug}</span>
                    <span>·</span>
                    <span>Status: </span>{statusBadge(activeRun.status)}
                  </div>
                  {activeRun.detail && (
                    <div className="rounded border bg-muted/30 px-3 py-2 text-xs"><strong>Note:</strong> {activeRun.detail}</div>
                  )}
                  {activeRun.status === "pending_approval" ? (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Subject</Label>
                        <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Message body</Label>
                        <Textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={10}
                          className="font-sans text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Edits apply only to this one message. The template stays unchanged.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded border bg-background p-3 max-h-[40vh] overflow-auto">
                      <pre className="whitespace-pre-wrap font-sans text-sm">{activeRun.body}</pre>
                    </div>
                  )}
                  {activeRun.approved_at && (
                    <div className="text-xs text-muted-foreground">
                      Actioned {format(new Date(activeRun.approved_at), "MMM d, h:mm a")}
                    </div>
                  )}
                </div>
                {activeRun.status === "pending_approval" && (
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => decide.mutate({ run_id: activeRun.id, action: "reject", reason: "Reviewer rejected" })} disabled={decide.isPending}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => saveRunEdits.mutate({ run_id: activeRun.id, subject: editSubject, body: editBody })}
                      disabled={saveRunEdits.isPending || !isEdited}
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Save edits
                    </Button>
                    <Button
                      onClick={async () => {
                        if (isEdited) {
                          await saveRunEdits.mutateAsync({ run_id: activeRun.id, subject: editSubject, body: editBody });
                        }
                        decide.mutate({ run_id: activeRun.id, action: "approve" });
                      }}
                      disabled={decide.isPending || saveRunEdits.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" /> {isEdited ? "Save & approve" : "Approve & send"}
                    </Button>
                  </DialogFooter>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Template preview */}
      <Dialog open={!!previewSlug} onOpenChange={(o) => !o && setPreviewSlug(null)}>
        <DialogContent>
          {previewSlug && TEMPLATES[previewSlug] && (
            <>
              <DialogHeader>
                <DialogTitle>{TEMPLATES[previewSlug].subject}</DialogTitle>
                <DialogDescription>Template: {previewSlug}</DialogDescription>
              </DialogHeader>
              <div className="rounded border bg-background p-3 max-h-[50vh] overflow-auto">
                <pre className="whitespace-pre-wrap font-sans text-sm">{TEMPLATES[previewSlug].body}</pre>
              </div>
              <p className="text-xs text-muted-foreground">Placeholders like <code>{"{{first_name}}"}</code> are filled per recipient at send time.</p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit step */}
      <Dialog open={!!editingSeq} onOpenChange={(o) => !o && setEditingSeq(null)}>
        {editingSeq && (
          <EditStepDialog
            seq={editingSeq}
            onDone={() => { setEditingSeq(null); qc.invalidateQueries({ queryKey: ["outreach-sequences-full"] }); }}
          />
        )}
      </Dialog>

      {/* Planned (not yet run) preview */}
      <Dialog open={!!previewPlanned} onOpenChange={(o) => !o && setPreviewPlanned(null)}>
        <DialogContent className="max-w-2xl">
          {previewPlanned && (() => {
            const seq = seqById.get(previewPlanned.seqId);
            const rec: any = recById.get(previewPlanned.recordId);
            if (!seq || !rec) return null;
            const ctx = {
              first_name: (rec.payload?.name || "").split(" ")[0] || "",
              notes: rec.payload?.notes || rec.payload?.message || "",
              event_date: rec.event_date || "",
            };
            const baseTpl = seq.template_slug ? TEMPLATES[seq.template_slug] : null;
            const subject = seq.subject_override ? applyVars(seq.subject_override, ctx) : applyVars(baseTpl?.subject || "", ctx);
            const body = seq.body_override ? applyVars(seq.body_override, ctx) : applyVars(baseTpl?.body || "", ctx);
            const dueLabel = formatInChurchTz(previewPlanned.dueAt, "MMM d, yyyy h:mm a", churchTz);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{subject || "Outreach preview"}</DialogTitle>
                  <DialogDescription>
                    {SRC_LABEL[seq.source]} · {seq.channel} · to {rec.payload?.name || "—"} · scheduled {dueLabel}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Step: {seq.description || seq.template_slug} · {seq.requires_approval ? "Requires review" : "Auto-sends"}
                  </div>
                  <div className="rounded border bg-background p-3 max-h-[40vh] overflow-auto">
                    <pre className="whitespace-pre-wrap font-sans text-sm">{body}</pre>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setPreviewPlanned(null); setEditingSeq(seq); }}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit step
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditStepDialog({ seq, onDone }: { seq: Sequence; onDone: () => void }) {
  const [channel, setChannel] = useState(seq.channel);
  const [audience, setAudience] = useState(seq.audience);
  const [anchor, setAnchor] = useState(seq.anchor);
  const [offset, setOffset] = useState(seq.offset_days);
  const [stepOrder, setStepOrder] = useState(seq.step_order);
  const [description, setDescription] = useState(seq.description || "");
  const [templateSlug, setTemplateSlug] = useState(seq.template_slug || "");
  const [requiresApproval, setRequiresApproval] = useState(seq.requires_approval);
  const [active, setActive] = useState(seq.active);
  const [subjectOverride, setSubjectOverride] = useState(seq.subject_override || "");
  const [bodyOverride, setBodyOverride] = useState(seq.body_override || "");

  const defaultTpl = templateSlug ? TEMPLATES[templateSlug] : null;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("outreach_sequences").update({
        channel, audience, anchor, offset_days: offset, step_order: stepOrder,
        description: description || null, template_slug: templateSlug || null,
        requires_approval: requiresApproval, active,
        subject_override: subjectOverride.trim() || null,
        body_override: bodyOverride.trim() || null,
      }).eq("id", seq.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Step updated"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Edit step · {SRC_LABEL[seq.source]} #{seq.step_order}</DialogTitle>
        <DialogDescription>Customize timing, channel, and exact message wording.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Step order</Label>
          <Input type="number" value={stepOrder} onChange={(e) => setStepOrder(parseInt(e.target.value, 10) || 1)} />
        </div>
        <div><Label>Channel</Label>
          <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="task">Task</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Audience</Label>
          <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="requester">Requester</SelectItem>
              <SelectItem value="fi_team">FI team</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Anchor</Label>
          <Select value={anchor} onValueChange={(v: any) => setAnchor(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="received">Received date</SelectItem>
              <SelectItem value="event_date">Event date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Offset (days; negative = before)</Label>
          <Input type="number" value={offset} onChange={(e) => setOffset(parseInt(e.target.value, 10) || 0)} />
        </div>
        <div><Label>Template slug</Label>
          <Input value={templateSlug} onChange={(e) => setTemplateSlug(e.target.value)} placeholder="interest-ack-email" />
        </div>
        <div className="col-span-2"><Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Subject override {defaultTpl && <span className="text-xs text-muted-foreground font-normal">(default: {defaultTpl.subject})</span>}</Label>
          <Input value={subjectOverride} onChange={(e) => setSubjectOverride(e.target.value)} placeholder="Leave blank to use default template" />
        </div>
        <div className="col-span-2">
          <Label>Body override</Label>
          <Textarea
            value={bodyOverride}
            onChange={(e) => setBodyOverride(e.target.value)}
            placeholder={defaultTpl?.body || "Leave blank to use default template"}
            rows={8}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Placeholders: <code>{"{{first_name}}"}</code>, <code>{"{{event_date}}"}</code>, <code>{"{{notes}}"}</code>
          </p>
        </div>
        <div className="col-span-2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} id="edit-ra" />
            <Label htmlFor="edit-ra">Require review before sending</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="edit-active" />
            <Label htmlFor="edit-active">Active</Label>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewStepDialog({ existingSteps, onDone }: { existingSteps: Sequence[]; onDone: () => void }) {
  const [source, setSource] = useState<"prayer" | "visit" | "interest">("interest");
  const [channel, setChannel] = useState<"email" | "sms" | "task">("email");
  const [audience, setAudience] = useState<"requester" | "fi_team">("requester");
  const [anchor, setAnchor] = useState<"received" | "event_date">("received");
  const [offset, setOffset] = useState(1);
  const [description, setDescription] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);

  const nextOrder = (existingSteps.filter((s) => s.source === source).reduce((m, s) => Math.max(m, s.step_order), 0)) + 1;

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("outreach_sequences").insert({
        source, step_order: nextOrder, offset_days: offset, anchor, channel,
        template_slug: templateSlug || null, audience, description: description || null,
        active: true, requires_approval: requiresApproval,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Step created"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New automation step</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Source</Label>
          <Select value={source} onValueChange={(v: any) => setSource(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prayer">Prayer</SelectItem>
              <SelectItem value="visit">Visit</SelectItem>
              <SelectItem value="interest">Interest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Channel</Label>
          <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="task">Task</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Audience</Label>
          <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="requester">Requester</SelectItem>
              <SelectItem value="fi_team">FI team</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Anchor</Label>
          <Select value={anchor} onValueChange={(v: any) => setAnchor(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="received">Received date</SelectItem>
              <SelectItem value="event_date">Event date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Offset (days; negative = before)</Label>
          <Input type="number" value={offset} onChange={(e) => setOffset(parseInt(e.target.value, 10) || 0)} />
        </div>
        <div><Label>Template slug</Label>
          <Input value={templateSlug} onChange={(e) => setTemplateSlug(e.target.value)} placeholder="interest-ack-email" />
        </div>
        <div className="col-span-2"><Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Friendly description" />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} id="ra" />
          <Label htmlFor="ra">Require admin review before sending</Label>
        </div>
      </div>
      <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>Create step</Button></DialogFooter>
    </DialogContent>
  );
}

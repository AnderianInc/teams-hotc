import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, MoreHorizontal, Check, X, Send, Pencil, Trash2, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Row = {
  id: string; attendee_id: string | null; template_slug: string | null;
  to_email: string; to_name: string | null; subject: string; body_html: string;
  scheduled_for: string; status: string; notes: string | null;
  approved_by: string | null; approved_at: string | null; sent_at: string | null; error: string | null;
};

export default function PendingEmailsPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkReschedule, setBulkReschedule] = useState("");
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["pending-emails", statusFilter],
    queryFn: async () => {
      let q = supabase.from("pending_email_approvals").select("*").order("scheduled_for", { ascending: true }).limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Row[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["pending-emails"] });

  const selectedRows = useMemo(
    () => (rows ?? []).filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  const toggleOne = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    if (on) setSelected(new Set((rows ?? []).map((r) => r.id)));
    else setSelected(new Set());
  };

  const allChecked = !!rows?.length && rows.every((r) => selected.has(r.id));
  const someChecked = !!selected.size && !allChecked;

  const update = async (id: string, patch: Partial<Row>) => {
    const { error } = await supabase.from("pending_email_approvals").update(patch).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };

  const bulkUpdate = async (ids: string[], patch: Partial<Row>) => {
    const { error } = await supabase.from("pending_email_approvals").update(patch).in("id", ids);
    if (error) { toast.error(error.message); return false; }
    refresh();
    return true;
  };

  const approve = (r: Row) => update(r.id, {
    status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString(),
  });

  const cancel = (r: Row) => update(r.id, { status: "cancelled" });

  const remove = async (id: string) => {
    if (!confirm("Delete this queued email?")) return;
    const { error } = await supabase.from("pending_email_approvals").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const sendNow = async (r: Row) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { to: r.to_email, to_name: r.to_name, subject: r.subject, html: r.body_html,
          logged_by: user?.id, related_attendee_id: r.attendee_id },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      await update(r.id, { status: "sent", sent_at: new Date().toISOString(), error: null });
      toast.success("Sent");
    } catch (e: any) {
      await update(r.id, { status: "failed", error: e.message });
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const saveEdits = async () => {
    if (!editing) return;
    await update(editing.id, {
      subject: editing.subject, body_html: editing.body_html,
      to_email: editing.to_email, to_name: editing.to_name,
      scheduled_for: editing.scheduled_for, notes: editing.notes,
    });
    setEditing(null);
    toast.success("Saved");
  };

  // ---------- bulk actions ----------
  const bulkApprove = async () => {
    const ids = selectedRows.filter((r) => r.status === "pending").map((r) => r.id);
    if (!ids.length) return toast.info("No pending emails selected");
    const ok = await bulkUpdate(ids, {
      status: "approved",
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    });
    if (ok) { toast.success(`Approved ${ids.length}`); setSelected(new Set()); }
  };

  const bulkCancel = async () => {
    const ids = selectedRows.filter((r) => r.status !== "sent" && r.status !== "cancelled").map((r) => r.id);
    if (!ids.length) return toast.info("Nothing to cancel");
    const ok = await bulkUpdate(ids, { status: "cancelled" });
    if (ok) { toast.success(`Cancelled ${ids.length}`); setSelected(new Set()); }
  };

  const bulkDelete = async () => {
    const ids = selectedRows.map((r) => r.id);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} queued email(s)? This cannot be undone.`)) return;
    const { error } = await supabase.from("pending_email_approvals").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
    refresh();
  };

  const bulkSendNow = async () => {
    const targets = selectedRows.filter((r) => r.status === "pending" || r.status === "approved");
    if (!targets.length) return toast.info("Nothing sendable selected");
    if (!confirm(`Send ${targets.length} email(s) now?`)) return;
    setBusy(true);
    let sent = 0, failed = 0;
    // throttle ~4/sec to respect Resend cap
    for (const r of targets) {
      try {
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: { to: r.to_email, to_name: r.to_name, subject: r.subject, html: r.body_html,
            logged_by: user?.id, related_attendee_id: r.attendee_id },
        });
        if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
        await update(r.id, { status: "sent", sent_at: new Date().toISOString(), error: null });
        sent++;
      } catch (e: any) {
        await update(r.id, { status: "failed", error: e.message });
        failed++;
      }
      await new Promise((res) => setTimeout(res, 250));
    }
    setBusy(false);
    toast[failed ? "warning" : "success"](`Sent ${sent}, failed ${failed}`);
    setSelected(new Set());
  };

  const openBulkEdit = () => {
    if (!selectedRows.length) return;
    setBulkReschedule("");
    setBulkSubject("");
    setBulkNotes("");
    setBulkEditOpen(true);
  };

  const applyBulkEdit = async () => {
    const ids = selectedRows.map((r) => r.id);
    const patch: Partial<Row> = {};
    if (bulkReschedule) patch.scheduled_for = new Date(bulkReschedule).toISOString();
    if (bulkSubject.trim()) patch.subject = bulkSubject.trim();
    if (bulkNotes.trim()) patch.notes = bulkNotes.trim();
    if (!Object.keys(patch).length) { toast.info("Nothing to change"); return; }
    const ok = await bulkUpdate(ids, patch);
    if (ok) {
      toast.success(`Updated ${ids.length}`);
      setBulkEditOpen(false);
      setSelected(new Set());
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, any> = {
      pending: "secondary", approved: "default", sent: "default",
      cancelled: "outline", failed: "destructive",
    };
    return <Badge variant={map[s] ?? "secondary"}>{s}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Pending Email Approvals
          </CardTitle>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          New contacts are auto-queued for the "Coffee with P.K" email one day after they register. Review, edit (e.g. set the <code>{`{{meeting_date}}`}</code>), then approve. Approved emails send automatically when their scheduled time arrives.
        </p>
      </CardHeader>
      <CardContent>
        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            <span className="text-sm font-medium px-2">{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={openBulkEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Bulk edit
            </Button>
            <Button size="sm" variant="outline" onClick={bulkApprove}>
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={bulkSendNow} disabled={busy}>
              <Send className="h-4 w-4 mr-1" /> Send now
            </Button>
            <Button size="sm" variant="outline" onClick={bulkCancel}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : !rows?.length ? (
          <p className="text-muted-foreground text-center py-8">Nothing here.</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allChecked || (someChecked ? "indeterminate" : false)}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.status === "failed" ? "bg-destructive/5" : selected.has(r.id) ? "bg-muted/40" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, !!v)}
                        aria-label="Select row"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(r.scheduled_for), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>
                      {r.to_name && <span className="font-medium">{r.to_name} </span>}
                      <span className="text-muted-foreground text-sm">{r.to_email}</span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.subject}
                      {r.error && <div className="text-xs text-destructive mt-1">{r.error}</div>}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 row-actions"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(r)}><Pencil className="h-4 w-4 mr-2" /> Review & edit</DropdownMenuItem>
                          {r.status === "pending" && (
                            <DropdownMenuItem onClick={() => approve(r)}><Check className="h-4 w-4 mr-2" /> Approve</DropdownMenuItem>
                          )}
                          {(r.status === "pending" || r.status === "approved") && (
                            <DropdownMenuItem onClick={() => sendNow(r)} disabled={busy}><Send className="h-4 w-4 mr-2" /> Send now</DropdownMenuItem>
                          )}
                          {r.status !== "cancelled" && r.status !== "sent" && (
                            <DropdownMenuItem onClick={() => cancel(r)}><X className="h-4 w-4 mr-2" /> Cancel</DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => remove(r.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review queued email</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>To email</Label>
                  <Input value={editing.to_email} onChange={(e) => setEditing({ ...editing, to_email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>To name</Label>
                  <Input value={editing.to_name ?? ""} onChange={(e) => setEditing({ ...editing, to_name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Scheduled for</Label>
                <Input type="datetime-local"
                  value={editing.scheduled_for.slice(0, 16)}
                  onChange={(e) => setEditing({ ...editing, scheduled_for: new Date(e.target.value).toISOString() })} />
              </div>
              <div className="space-y-1">
                <Label>Subject</Label>
                <Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Body (Markdown or HTML)</Label>
                <Textarea rows={14} value={editing.body_html} onChange={(e) => setEditing({ ...editing, body_html: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">Replace <code>{`{{meeting_date}}`}</code> with the actual interest meeting date before approving.</p>
              </div>
              <div className="space-y-1">
                <Label>Internal notes</Label>
                <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdits}>Save changes</Button>
            {editing?.status === "pending" && (
              <Button onClick={async () => { await saveEdits(); await approve(editing!); }}>
                <Check className="h-4 w-4 mr-1" /> Save & approve
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Bulk edit {selected.size} email(s)</DialogTitle>
            <DialogDescription>Leave a field blank to keep its current value on each row.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Reschedule to</Label>
              <Input type="datetime-local" value={bulkReschedule} onChange={(e) => setBulkReschedule(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Replace subject</Label>
              <Input value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)} placeholder="(leave blank to keep)" />
            </div>
            <div className="space-y-1">
              <Label>Set internal note</Label>
              <Textarea rows={3} value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} placeholder="(leave blank to keep)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>Cancel</Button>
            <Button onClick={applyBulkEdit}>Apply to {selected.size}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

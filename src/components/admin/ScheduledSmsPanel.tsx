import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, MoreHorizontal, Send, Pencil, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Row = {
  id: string;
  attendee_id: string | null;
  to_phone: string;
  to_name: string | null;
  body: string;
  scheduled_for: string;
  status: string;
  notes: string | null;
  override_consent: boolean;
  consent_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  error: string | null;
};

export default function ScheduledSmsPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("approved");
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["pending-sms", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("pending_sms_approvals")
        .select("*")
        .order("scheduled_for", { ascending: true })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as Row[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["pending-sms"] });

  const update = async (id: string, patch: Partial<Row>) => {
    const { error } = await supabase.from("pending_sms_approvals").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const cancel = (r: Row) => update(r.id, { status: "cancelled" });

  const remove = async (id: string) => {
    if (!confirm("Delete this scheduled text?")) return;
    const { error } = await supabase.from("pending_sms_approvals").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const sendNow = async (r: Row) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          to: r.to_phone,
          body: r.body,
          to_name: r.to_name,
          related_attendee_id: r.attendee_id,
          logged_by: user?.id,
          override_consent: r.override_consent || undefined,
          consent_note: r.override_consent ? r.consent_note ?? undefined : undefined,
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      await update(r.id, { status: "sent", sent_at: new Date().toISOString(), error: null });
      toast.success("Sent");
    } catch (e: any) {
      await update(r.id, { status: "failed", error: e.message });
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = async () => {
    if (!editing) return;
    await update(editing.id, {
      to_phone: editing.to_phone,
      to_name: editing.to_name,
      body: editing.body,
      scheduled_for: editing.scheduled_for,
      notes: editing.notes,
    });
    setEditing(null);
    toast.success("Saved");
  };

  const statusBadge = (s: string) => {
    const map: Record<string, any> = {
      approved: "default",
      sent: "default",
      cancelled: "outline",
      failed: "destructive",
    };
    return <Badge variant={map[s] ?? "secondary"}>{s}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Scheduled Text Messages
          </CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="approved">Scheduled</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Texts scheduled from the composer. Send automatically at their scheduled time.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : !rows?.length ? (
          <p className="text-muted-foreground text-center py-8">No scheduled texts.</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.status === "failed" ? "bg-destructive/5" : ""}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(r.scheduled_for), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>
                      {r.to_name && <span className="font-medium">{r.to_name} </span>}
                      <span className="text-muted-foreground text-sm">{r.to_phone}</span>
                    </TableCell>
                    <TableCell className="max-w-md truncate" title={r.body}>
                      {r.body}
                      {r.error && <div className="text-xs text-destructive mt-1">{r.error}</div>}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(r)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {(r.status === "approved") && (
                            <DropdownMenuItem onClick={() => sendNow(r)} disabled={busy}>
                              <Send className="h-4 w-4 mr-2" /> Send now
                            </DropdownMenuItem>
                          )}
                          {r.status !== "cancelled" && r.status !== "sent" && (
                            <DropdownMenuItem onClick={() => cancel(r)}>
                              <X className="h-4 w-4 mr-2" /> Cancel
                            </DropdownMenuItem>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit scheduled text</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>To phone</Label>
                  <Input value={editing.to_phone} onChange={(e) => setEditing({ ...editing, to_phone: e.target.value })} />
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
                <Label>Message</Label>
                <Textarea rows={6} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdits}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

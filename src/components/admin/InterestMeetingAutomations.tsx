import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Zap } from "lucide-react";
import { toast } from "sonner";

type Sequence = {
  id: string;
  source: string;
  step_order: number;
  description: string | null;
  channel: string;
  audience: string;
  anchor: string;
  offset_days: number;
  template_slug: string | null;
  subject_override: string | null;
  body_override: string | null;
  requires_approval: boolean;
  active: boolean;
};

const emptyForm: Partial<Sequence> = {
  description: "",
  channel: "email",
  audience: "requester",
  anchor: "event",
  offset_days: 0,
  template_slug: "",
  subject_override: "",
  body_override: "",
  requires_approval: true,
  active: true,
};

export default function InterestMeetingAutomations({ source = "interest" }: { source?: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: Sequence } | null>(null);
  const [form, setForm] = useState<Partial<Sequence>>(emptyForm);

  const { data: rows = [] } = useQuery({
    queryKey: ["outreach-sequences", source],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_sequences")
        .select("*")
        .eq("source", source)
        .order("step_order");
      if (error) throw error;
      return (data || []) as Sequence[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["email-templates-slugs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("slug, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        source,
        description: form.description || null,
        channel: form.channel,
        audience: form.audience,
        anchor: form.anchor,
        offset_days: Number(form.offset_days) || 0,
        template_slug: form.template_slug || null,
        subject_override: form.subject_override || null,
        body_override: form.body_override || null,
        requires_approval: !!form.requires_approval,
        active: !!form.active,
      };
      if (dialog?.mode === "edit" && dialog.row) {
        const { error } = await supabase.from("outreach_sequences").update(payload).eq("id", dialog.row.id);
        if (error) throw error;
      } else {
        payload.step_order = (rows.reduce((m, r) => Math.max(m, r.step_order), 0) || 0) + 1;
        const { error } = await supabase.from("outreach_sequences").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Automation saved");
      setDialog(null);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["outreach-sequences", source] });
      qc.invalidateQueries({ queryKey: ["outreach-sequences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: Sequence) => {
      // If any runs reference it, just deactivate to keep history intact
      const { count } = await supabase
        .from("outreach_sequence_runs")
        .select("id", { count: "exact", head: true })
        .eq("sequence_id", row.id);
      if ((count || 0) > 0) {
        const { error } = await supabase.from("outreach_sequences").update({ active: false }).eq("id", row.id);
        if (error) throw error;
        return "deactivated";
      }
      const { error } = await supabase.from("outreach_sequences").delete().eq("id", row.id);
      if (error) throw error;
      return "deleted";
    },
    onSuccess: (kind) => {
      toast.success(kind === "deactivated" ? "Step had history — deactivated instead of deleted" : "Step deleted");
      qc.invalidateQueries({ queryKey: ["outreach-sequences", source] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: Sequence) => {
      const { error } = await supabase.from("outreach_sequences").update({ active: !row.active }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach-sequences", source] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: async ({ row, dir }: { row: Sequence; dir: -1 | 1 }) => {
      const sorted = [...rows].sort((a, b) => a.step_order - b.step_order);
      const idx = sorted.findIndex((r) => r.id === row.id);
      const swap = sorted[idx + dir];
      if (!swap) return;
      const a = swap.step_order;
      const b = row.step_order;
      await supabase.from("outreach_sequences").update({ step_order: -1 }).eq("id", row.id);
      await supabase.from("outreach_sequences").update({ step_order: b }).eq("id", swap.id);
      await supabase.from("outreach_sequences").update({ step_order: a }).eq("id", row.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach-sequences", source] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setForm(emptyForm); setDialog({ mode: "create" }); };
  const openEdit = (row: Sequence) => {
    setForm({
      description: row.description || "",
      channel: row.channel,
      audience: row.audience,
      anchor: row.anchor,
      offset_days: row.offset_days,
      template_slug: row.template_slug || "",
      subject_override: row.subject_override || "",
      body_override: row.body_override || "",
      requires_approval: row.requires_approval,
      active: row.active,
    });
    setDialog({ mode: "edit", row });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" /> Interest meeting automations
        </CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add step</Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Steps run automatically for every attendee registered to an interest meeting.
          Offsets are relative to the chosen anchor (e.g. <code>event</code> = days from meeting date; negative = before).
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No automation steps yet</TableCell></TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={row.id}>
                <TableCell className="text-xs text-muted-foreground">{row.step_order}</TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium">{row.description || row.template_slug || "Step"}</div>
                  {row.template_slug && <div className="text-xs text-muted-foreground">template: {row.template_slug}</div>}
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{row.channel}</Badge></TableCell>
                <TableCell className="text-xs">{row.audience}</TableCell>
                <TableCell className="text-xs">{row.offset_days >= 0 ? `+${row.offset_days}` : row.offset_days} days from {row.anchor}</TableCell>
                <TableCell className="text-xs">{row.requires_approval ? "Required" : "Auto-send"}</TableCell>
                <TableCell>
                  <Switch checked={row.active} onCheckedChange={() => toggleActive.mutate(row)} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => reorder.mutate({ row, dir: -1 })}><ArrowUp className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === rows.length - 1} onClick={() => reorder.mutate({ row, dir: 1 })}><ArrowDown className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => confirm("Delete this automation step?") && remove.mutate(row)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) { setDialog(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? "Edit automation step" : "New automation step"}</DialogTitle>
            <DialogDescription>Runs for every attendee in this source's pipeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description || ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. 7-day reminder email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Audience</Label>
                <Select value={form.audience} onValueChange={(v) => setForm((f) => ({ ...f, audience: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="requester">Requester</SelectItem>
                    <SelectItem value="team">FI team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Anchor</Label>
                <Select value={form.anchor} onValueChange={(v) => setForm((f) => ({ ...f, anchor: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="event">Event date</SelectItem>
                    <SelectItem value="received">Received date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Offset (days)</Label>
                <Input type="number" value={form.offset_days ?? 0} onChange={(e) => setForm((f) => ({ ...f, offset_days: parseInt(e.target.value, 10) || 0 }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email template (optional)</Label>
              <Select value={form.template_slug || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, template_slug: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None — use overrides below" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(templates as any[]).map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>{t.name} ({t.slug})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subject override (optional)</Label>
              <Input value={form.subject_override || ""} onChange={(e) => setForm((f) => ({ ...f, subject_override: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Body override (optional)</Label>
              <Textarea rows={4} value={form.body_override || ""} onChange={(e) => setForm((f) => ({ ...f, body_override: e.target.value }))} placeholder="Plain text or HTML. Use {{first_name}} placeholders." />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Requires approval before send</Label>
              <Switch checked={!!form.requires_approval} onCheckedChange={(v) => setForm((f) => ({ ...f, requires_approval: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Active</Label>
              <Switch checked={!!form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import { useTemplateSlots, useInvalidateOoS, type ServiceTemplate, type TemplateSlot } from "@/hooks/useOrderOfService";
import { useAllTeams } from "@/hooks/useTeams";

interface Props {
  template: ServiceTemplate;
  onClose: () => void;
}

export default function ServiceTemplateEditor({ template, onClose }: Props) {
  const invalidate = useInvalidateOoS();
  const { data: slots = [] } = useTemplateSlots(template.id);
  const { data: teams = [] } = useAllTeams();
  const [name, setName] = useState(template.name);
  const [startTime, setStartTime] = useState(template.default_start_time?.slice(0, 5) || "");
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState(5);

  const saveMeta = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("service_templates")
        .update({ name: name.trim(), default_start_time: startTime || null })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSlot = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("service_template_slots").insert({
        template_id: template.id,
        order_index: slots.length,
        title: newTitle.trim(),
        duration_minutes: newDuration || 5,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setNewTitle("");
      setNewDuration(5);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSlot = useMutation({
    mutationFn: async (patch: { id: string } & Partial<TemplateSlot>) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("service_template_slots").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_template_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = async (idx: number, dir: -1 | 1) => {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= slots.length) return;
    const a = slots[idx];
    const b = slots[swapIdx];
    await supabase.from("service_template_slots").update({ order_index: b.order_index }).eq("id", a.id);
    await supabase.from("service_template_slots").update({ order_index: a.order_index }).eq("id", b.id);
    invalidate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => saveMeta.mutate()} />
            </div>
            <div>
              <Label>Default start time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} onBlur={() => saveMeta.mutate()} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Slots</Label>
            <div className="space-y-2">
              {slots.map((slot, idx) => (
                <Card key={slot.id}>
                  <CardContent className="py-3 flex items-center gap-2 flex-wrap">
                    <div className="flex flex-col gap-0.5">
                      <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, -1)} disabled={idx === 0}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, 1)} disabled={idx === slots.length - 1}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      className="flex-1 min-w-[160px]"
                      defaultValue={slot.title}
                      onBlur={(e) => e.target.value !== slot.title && updateSlot.mutate({ id: slot.id, title: e.target.value })}
                    />
                    <Input
                      type="number"
                      className="w-20"
                      defaultValue={slot.duration_minutes}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (n > 0 && n !== slot.duration_minutes) updateSlot.mutate({ id: slot.id, duration_minutes: n });
                      }}
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                    <Select
                      value={slot.default_team_id || "none"}
                      onValueChange={(v) => updateSlot.mutate({ id: slot.id, default_team_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No default team</SelectItem>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => deleteSlot.mutate(slot.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <Label className="mb-2 block">Add slot</Label>
            <div className="flex gap-2 flex-wrap">
              <Input
                className="flex-1 min-w-[200px]"
                placeholder="Welcome / Worship / Announcements…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <Input
                type="number"
                className="w-20"
                value={newDuration}
                onChange={(e) => setNewDuration(parseInt(e.target.value, 10) || 5)}
              />
              <Button onClick={() => addSlot.mutate()} disabled={!newTitle.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

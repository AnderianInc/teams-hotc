import { useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Plus, Printer, Trash2, ArrowUp, ArrowDown, Clock, X,
} from "lucide-react";
import {
  useInstance, useInstanceSlots, useSlotAssignments, useInvalidateOoS,
  type InstanceSlot,
} from "@/hooks/useOrderOfService";
import SlotAssignPopover from "@/components/admin/SlotAssignPopover";
import { useAllTeams } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export default function ServiceRunSheet() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPrint = searchParams.get("print") === "1";
  const invalidate = useInvalidateOoS();
  const { isAdmin } = useAuth();
  const canEdit = isAdmin && !isPrint;
  const backTo = isAdmin ? "/admin?tab=order-of-service" : "/order-of-service";
  const printBase = isAdmin ? "/admin/order-of-service" : "/order-of-service";

  const { data: instance, isLoading } = useInstance(instanceId!);
  const { data: slots = [] } = useInstanceSlots(instanceId!);
  const { data: assignments = [] } = useSlotAssignments(instanceId!);
  const { data: teams = [] } = useAllTeams();

  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState(5);

  // Fetch names of assigned people
  const profileIds = useMemo(() => assignments.filter((a) => a.profile_id).map((a) => a.profile_id!), [assignments]);
  const attendeeIds = useMemo(() => assignments.filter((a) => a.attendee_id).map((a) => a.attendee_id!), [assignments]);

  const { data: nameMap = {} } = useQuery({
    queryKey: ["slot-assignment-names", profileIds.sort().join(","), attendeeIds.sort().join(",")],
    enabled: assignments.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      if (profileIds.length) {
        const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", profileIds);
        (data || []).forEach((p: any) => (map[`p:${p.id}`] = p.full_name || p.email || "Unknown"));
      }
      if (attendeeIds.length) {
        const { data } = await supabase.from("attendees").select("id, first_name, last_name").in("id", attendeeIds);
        (data || []).forEach((a: any) => (map[`a:${a.id}`] = `${a.first_name} ${a.last_name}`));
      }
      return map;
    },
  });

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name;

  const addSlot = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("service_instance_slots").insert({
        instance_id: instanceId!,
        order_index: slots.length,
        title: newTitle.trim(),
        duration_minutes: newDuration || 5,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(instanceId);
      setNewTitle("");
      setNewDuration(5);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSlot = useMutation({
    mutationFn: async (patch: { id: string } & Partial<InstanceSlot>) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("service_instance_slots").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(instanceId),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_instance_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(instanceId),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (a: { id: string; roster_entry_id: string | null }) => {
      if (a.roster_entry_id) {
        await supabase.from("roster_entries").delete().eq("id", a.roster_entry_id);
      }
      const { error } = await supabase.from("service_slot_assignments").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(instanceId),
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async () => {
      if (!instance) return;
      const next = instance.status === "published" ? "draft" : "published";
      const { error } = await supabase.from("service_instances").update({ status: next }).eq("id", instance.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(instanceId),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = async (idx: number, dir: -1 | 1) => {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= slots.length) return;
    const a = slots[idx];
    const b = slots[swapIdx];
    await supabase.from("service_instance_slots").update({ order_index: b.order_index }).eq("id", a.id);
    await supabase.from("service_instance_slots").update({ order_index: a.order_index }).eq("id", b.id);
    invalidate(instanceId);
  };

  if (isLoading || !instance) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Compute clock times
  const baseTime = instance.start_time?.slice(0, 5) || "10:00";
  let running = baseTime;
  const timedSlots = slots.map((s) => {
    const startClock = running;
    running = addMinutes(running, s.duration_minutes);
    return { ...s, startClock };
  });

  return (
    <div className={`space-y-6 ${isPrint ? "p-6" : ""}`}>
      {!isPrint && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin?tab=order-of-service")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to services
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`/admin/order-of-service/${instance.id}?print=1`, "_blank")}>
              <Printer className="h-4 w-4 mr-1" /> Print view
            </Button>
            <Button size="sm" onClick={() => togglePublish.mutate()}>
              {instance.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">{instance.title}</h1>
        <p className="text-muted-foreground flex items-center gap-2 mt-1">
          {format(new Date(instance.service_date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
          {instance.start_time && <> · <Clock className="h-3 w-3 inline" /> {instance.start_time.slice(0, 5)}</>}
          {!isPrint && <Badge variant={instance.status === "published" ? "default" : "secondary"}>{instance.status}</Badge>}
        </p>
      </div>

      <div className="space-y-2">
        {timedSlots.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No slots yet. Add one below.
            </CardContent>
          </Card>
        )}

        {timedSlots.map((slot, idx) => {
          const slotAssignments = assignments.filter((a) => a.slot_id === slot.id);
          return (
            <Card key={slot.id}>
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <div className="text-right shrink-0 w-16 pt-1">
                    <p className="font-mono text-sm">{slot.startClock}</p>
                    <p className="text-xs text-muted-foreground">{slot.duration_minutes} min</p>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPrint ? (
                        <span className="font-medium">{slot.title}</span>
                      ) : (
                        <Input
                          className="flex-1 min-w-[200px] h-8"
                          defaultValue={slot.title}
                          onBlur={(e) => e.target.value !== slot.title && updateSlot.mutate({ id: slot.id, title: e.target.value })}
                        />
                      )}
                      {!isPrint && (
                        <>
                          <Input
                            type="number"
                            className="w-16 h-8"
                            defaultValue={slot.duration_minutes}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (n > 0 && n !== slot.duration_minutes) updateSlot.mutate({ id: slot.id, duration_minutes: n });
                            }}
                          />
                          <SlotAssignPopover slot={slot} rosterEventId={instance.roster_event_id} serviceDate={instance.service_date} />
                          <div className="flex flex-col gap-0.5">
                            <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, -1)} disabled={idx === 0}>
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, 1)} disabled={idx === timedSlots.length - 1}>
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => deleteSlot.mutate(slot.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    {slot.team_id && (
                      <p className="text-xs text-muted-foreground">Team: {teamName(slot.team_id)}</p>
                    )}
                    {slotAssignments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {slotAssignments.map((a) => {
                          const key = a.profile_id ? `p:${a.profile_id}` : `a:${a.attendee_id}`;
                          const name = nameMap[key] || "…";
                          return (
                            <Badge key={a.id} variant="secondary" className="gap-1">
                              {name}
                              {a.role_label && <span className="opacity-70">· {a.role_label}</span>}
                              {!isPrint && (
                                <button
                                  onClick={() => removeAssignment.mutate({ id: a.id, roster_entry_id: a.roster_entry_id })}
                                  className="ml-1 opacity-60 hover:opacity-100"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isPrint && (
        <Card>
          <CardContent className="py-3">
            <Label className="mb-2 block">Add slot</Label>
            <div className="flex gap-2 flex-wrap">
              <Input
                className="flex-1 min-w-[200px]"
                placeholder="Slot title"
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

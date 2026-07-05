import React, { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, Plus, Printer, Trash2, ArrowUp, ArrowDown, Clock, X,
  Music,
} from "lucide-react";
import {
  deleteServiceInstance, useInstance, useInstanceSlots, useSlotAssignments, useInvalidateOoS,
  type InstanceSlot,
} from "@/hooks/useOrderOfService";
import SlotAssignPopover from "@/components/admin/SlotAssignPopover";
import { useAllTeams, useMyTeams } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function SongListPopover({
  songs,
  canEdit,
  onChange,
}: {
  songs: string[];
  canEdit: boolean;
  onChange: (songs: string[]) => void;
}) {
  const [songTitle, setSongTitle] = useState("");
  const [open, setOpen] = useState(false);
  const cleanSongs = (songs || []).filter(Boolean);

  const addSong = () => {
    const next = songTitle.trim();
    if (!next) return;
    onChange([...cleanSongs, next]);
    setSongTitle("");
  };

  if (!canEdit && cleanSongs.length === 0) return null;

  const summary = cleanSongs.length ? cleanSongs.join(" · ") : canEdit ? "Add songs" : "";

  const trigger = (
    <div className="flex items-center gap-1 mt-0.5 max-w-[220px]">
      <Music className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground truncate">
        {summary}
      </span>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {canEdit ? (
          <button className="text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            {trigger}
          </button>
        ) : (
          <div>{trigger}</div>
        )}
      </PopoverTrigger>
      {canEdit && (
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Music className="h-4 w-4" /> Songs
            </div>
            {cleanSongs.length > 0 && (
              <div className="space-y-1">
                {cleanSongs.map((song, songIdx) => (
                  <div key={`${song}-${songIdx}`} className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1"
                      value={song}
                      onChange={(event) => onChange(cleanSongs.map((item, idx) => (idx === songIdx ? event.target.value : item)))}
                      onBlur={() => onChange(cleanSongs.map((item) => item.trim()).filter(Boolean))}
                    />
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange(cleanSongs.filter((_, idx) => idx !== songIdx))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                className="h-8"
                placeholder="Song title"
                value={songTitle}
                onChange={(event) => setSongTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSong();
                  }
                }}
              />
              <Button size="sm" variant="outline" onClick={addSong} disabled={!songTitle.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
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
  const { data: myTeams = [] } = useMyTeams();
  const { data: scheduledTeams = [] } = useQuery({
    queryKey: ["run-sheet-scheduled-teams", instance?.roster_event_id],
    enabled: !!instance?.roster_event_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roster_event_teams")
        .select("team_id, teams(name)")
        .eq("event_id", instance!.roster_event_id!);
      if (error) throw error;
      return data || [];
    },
  });

  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState(5);
  const [newTeamId, setNewTeamId] = useState("");

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
  const allowedTeamIds = scheduledTeams.map((team: any) => team.team_id).filter(Boolean);
  const myTeamIds = useMemo(() => myTeams.map((item) => item.team_id).filter(Boolean), [myTeams]);

  const addSlot = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("service_instance_slots").insert({
        instance_id: instanceId!,
        order_index: slots.length,
        title: newTitle.trim(),
        duration_minutes: newDuration || 5,
        team_id: newTeamId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(instanceId);
      setNewTitle("");
      setNewDuration(5);
      setNewTeamId("");
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

  const publish = useMutation({
    mutationFn: async (nextStatus: "published" | "draft") => {
      if (!instance) return;
      const patch: { status: string; published_at?: string | null } = { status: nextStatus };
      if (nextStatus === "published") {
        patch.published_at = new Date().toISOString();
      }
      const { error } = await supabase.from("service_instances").update(patch).eq("id", instance.id);
      if (error) throw error;
    },
    onSuccess: (_d, nextStatus) => {
      invalidate(instanceId);
      toast.success(nextStatus === "published" ? "Order of service published" : "Order of service unpublished");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteInstance = useMutation({
    mutationFn: async () => {
      if (!instance) return;
      await deleteServiceInstance(instance.id);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Service deleted");
      navigate(backTo);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSongs = useMutation({
    mutationFn: async ({ slotId, songs }: { slotId: string; songs: string[] }) => {
      const { error } = await supabase.rpc("update_service_slot_songs" as any, {
        _slot_id: slotId,
        _songs: songs,
      });
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
          <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to services
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`${printBase}/${instance.id}?print=1`, "_blank")}>
              <Printer className="h-4 w-4 mr-1" /> Print view
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  if (confirm(`Delete "${instance.title}"? You can create a fresh run sheet from the template afterward.`)) {
                    deleteInstance.mutate();
                  }
                }} disabled={deleteInstance.isPending}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete service
                </Button>
                {(() => {
                  const isPublished = instance.status === "published";
                  const hasChanges =
                    isPublished &&
                    !!instance.published_at &&
                    !!instance.updated_at &&
                    new Date(instance.updated_at).getTime() > new Date(instance.published_at).getTime() + 500;

                  if (!isPublished) {
                    return (
                      <Button size="sm" onClick={() => publish.mutate("published")} disabled={publish.isPending}>
                        Publish
                      </Button>
                    );
                  }
                  return (
                    <>
                      {hasChanges && (
                        <Button size="sm" onClick={() => publish.mutate("published")} disabled={publish.isPending}>
                          Update published version
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => publish.mutate("draft")} disabled={publish.isPending}>
                        Unpublish
                      </Button>
                    </>
                  );
                })()}
              </>
            )}
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

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {canEdit && <th className="w-10 px-2 py-2"></th>}
              <th className="w-20 px-2 py-2 text-left font-medium">Time</th>
              <th className="px-2 py-2 text-left font-medium">Item</th>
              {canEdit && <th className="w-14 px-2 py-2 text-left font-medium">Min</th>}
              <th className="w-[160px] px-2 py-2 text-left font-medium">Team</th>
              <th className="px-2 py-2 text-left font-medium">Assigned</th>
              {canEdit && <th className="w-14 px-2 py-2 text-center font-medium">Songs</th>}
              {canEdit && <th className="w-10 px-2 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {timedSlots.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 8 : 4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No slots yet.{canEdit ? " Add one below." : ""}
                </td>
              </tr>
            )}
            {timedSlots.map((slot, idx) => {
              const slotAssignments = assignments.filter((a) => a.slot_id === slot.id);
              const isSong = !!slot.is_song_slot;
              const canEditSongs = !isPrint && isSong && (canEdit || (!!slot.team_id && myTeamIds.includes(slot.team_id)));
              const showSongsRow = isSong && (canEditSongs || (slot.songs || []).filter(Boolean).length > 0);
              return (
                <React.Fragment key={slot.id}>
                  <tr className="border-t align-middle">
                    {canEdit && (
                      <td className="px-1 py-1">
                        <div className="flex flex-col">
                          <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, -1)} disabled={idx === 0}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, 1)} disabled={idx === timedSlots.length - 1}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-1 whitespace-nowrap">
                      <div className="font-mono text-sm">{slot.startClock}</div>
                      {!canEdit && <div className="text-[10px] text-muted-foreground">{slot.duration_minutes} min</div>}
                    </td>
                    <td className="px-2 py-1">
                      {canEdit ? (
                        <div className="space-y-1">
                          <Input
                            className="h-8"
                            defaultValue={slot.title}
                            onBlur={(e) => e.target.value !== slot.title && updateSlot.mutate({ id: slot.id, title: e.target.value })}
                          />
                          <SongListPopover
                            songs={slot.songs || []}
                            canEdit={canEditSongs}
                            onChange={(songs) => updateSongs.mutate({ slotId: slot.id, songs })}
                          />
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="font-medium">{slot.title}</span>
                          <SongListPopover
                            songs={slot.songs || []}
                            canEdit={canEditSongs}
                            onChange={(songs) => updateSongs.mutate({ slotId: slot.id, songs })}
                          />
                        </div>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          className="h-8 w-14"
                          defaultValue={slot.duration_minutes}
                          onBlur={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (n > 0 && n !== slot.duration_minutes) updateSlot.mutate({ id: slot.id, duration_minutes: n });
                          }}
                        />
                      </td>
                    )}
                    <td className="px-2 py-1">
                      {canEdit ? (
                        <Select
                          value={slot.team_id || "none"}
                          onValueChange={(value) => updateSlot.mutate({ id: slot.id, team_id: value === "none" ? null : value })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Team" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No team</SelectItem>
                            {(scheduledTeams.length ? scheduledTeams : teams).map((item: any) => {
                              const id = item.team_id || item.id;
                              const name = item.teams?.name || item.name;
                              return <SelectItem key={id} value={id}>{name}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{teamName(slot.team_id) || "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {slotAssignments.map((a) => {
                          const key = a.profile_id ? `p:${a.profile_id}` : `a:${a.attendee_id}`;
                          const name = nameMap[key] || "…";
                          return (
                            <Badge key={a.id} variant="secondary" className="gap-1">
                              {name}
                              {a.role_label && <span className="opacity-70">· {a.role_label}</span>}
                              {canEdit && (
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
                        {canEdit && (
                          <SlotAssignPopover
                            slot={slot}
                            rosterEventId={instance.roster_event_id}
                            serviceDate={instance.service_date}
                            allowedTeamIds={slot.team_id && (!allowedTeamIds.length || allowedTeamIds.includes(slot.team_id)) ? [slot.team_id] : allowedTeamIds}
                          />
                        )}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-2 py-1 text-center">
                        <Checkbox
                          checked={isSong}
                          onCheckedChange={(v) => updateSlot.mutate({ id: slot.id, is_song_slot: !!v as any })}
                          aria-label="Mark as song slot"
                        />
                      </td>
                    )}
                    {canEdit && (
                      <td className="px-1 py-1">
                        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => deleteSlot.mutate(slot.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
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
              <Select value={newTeamId || "none"} onValueChange={(value) => setNewTeamId(value === "none" ? "" : value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No team</SelectItem>
                  {(scheduledTeams.length ? scheduledTeams : teams).map((item: any) => {
                    const id = item.team_id || item.id;
                    const name = item.teams?.name || item.name;
                    return <SelectItem key={id} value={id}>{name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
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

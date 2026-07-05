import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, Music, Plus, Trash2, Users, X } from "lucide-react";
import { useTemplateSlots, useInvalidateOoS, type ServiceTemplate, type TemplateSlot } from "@/hooks/useOrderOfService";
import { useAllTeams } from "@/hooks/useTeams";

interface Props {
  template: ServiceTemplate;
  onClose: () => void;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) return "";
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total % (24 * 60)) / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function useTeamMembers(teamId: string | null) {
  return useQuery({
    queryKey: ["template-slot-team-members", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(id, full_name, email)")
        .eq("team_id", teamId!);
      if (error) throw error;
      return data || [];
    },
  });
}

function useAllProfiles() {
  return useQuery({
    queryKey: ["template-slot-all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });
}

function MemberPicker({
  slot,
  onChange,
}: {
  slot: TemplateSlot;
  onChange: (ids: string[]) => void;
}) {
  const { data: teamMembers = [] } = useTeamMembers(slot.default_team_id);
  const { data: allProfiles = [] } = useAllProfiles();

  const candidates = useMemo(() => {
    if (slot.default_team_id && teamMembers.length) {
      return teamMembers.map((m: any) => ({
        id: m.profiles?.id || m.user_id,
        name: m.profiles?.full_name || m.profiles?.email || "Unknown",
      }));
    }
    return (allProfiles as any[]).map((p) => ({
      id: p.id,
      name: p.full_name || p.email || "Unknown",
    }));
  }, [slot.default_team_id, teamMembers, allProfiles]);

  const selected = slot.default_profile_ids || [];
  const nameById = new Map<string, string>();
  (allProfiles as any[]).forEach((p) => nameById.set(p.id, p.full_name || p.email || "Unknown"));
  candidates.forEach((c) => nameById.set(c.id, c.name));
  const selectedNames = selected.map((id) => nameById.get(id) || "Unknown");
  const triggerLabel = selectedNames.length === 0
    ? "Default members"
    : selectedNames.length === 1
      ? selectedNames[0]
      : `${selectedNames[0]} +${selectedNames.length - 1}`;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Users className="h-3.5 w-3.5 mr-1" />
          <span className="max-w-[150px] truncate">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <p className="text-xs text-muted-foreground px-1 pb-1">
          {slot.default_team_id ? "Members from selected team" : "All directory profiles"}
        </p>
        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {candidates.length === 0 && (
            <p className="text-sm text-muted-foreground px-1 py-2">No members available.</p>
          )}
          {candidates.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-1">
              <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="border-t mt-2 pt-2 flex flex-wrap gap-1">
            {selected.map((id) => (
              <Badge key={id} variant="secondary" className="text-[10px]">
                {nameById.get(id) || "Unknown"}
              </Badge>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}


function SongEditor({ songs, onChange }: { songs: string[]; onChange: (songs: string[]) => void }) {
  const [songTitle, setSongTitle] = useState("");
  const cleanSongs = (songs || []).filter(Boolean);

  const addSong = () => {
    const next = songTitle.trim();
    if (!next) return;
    onChange([...cleanSongs, next]);
    setSongTitle("");
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Music className="h-4 w-4" /> Songs
      </div>
      {cleanSongs.length > 0 && (
        <div className="space-y-1">
          {cleanSongs.map((song, songIdx) => (
            <div key={`${song}-${songIdx}`} className="flex items-center gap-2">
              <Input
                className="h-8"
                value={song}
                onChange={(event) => onChange(cleanSongs.map((item, idx) => (idx === songIdx ? event.target.value : item)))}
                onBlur={() => onChange(cleanSongs.map((item) => item.trim()).filter(Boolean))}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => onChange(cleanSongs.filter((_, idx) => idx !== songIdx))}
              >
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
  );
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
      const { error } = await supabase.from("service_template_slots").update(rest as any).eq("id", id);
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

  // Compute cumulative start times for each slot given the template start time
  const slotTimes = useMemo(() => {
    const result: { start: string; end: string }[] = [];
    let cursor = startTime || "";
    for (const s of slots) {
      if (!cursor) {
        result.push({ start: "", end: "" });
        continue;
      }
      const end = addMinutes(cursor, s.duration_minutes || 0);
      result.push({ start: cursor, end });
      cursor = end;
    }
    return result;
  }, [slots, startTime]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
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
            <div className="flex items-center justify-between mb-2">
              <Label>Slots</Label>
              {startTime && slotTimes.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Ends {slotTimes[slotTimes.length - 1].end || "—"}
                </span>
              )}
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-2 py-2"></th>
                    <th className="w-28 px-2 py-2 text-left font-medium">Time</th>
                    <th className="px-2 py-2 text-left font-medium">Title</th>
                    <th className="w-16 px-2 py-2 text-left font-medium">Min</th>
                    <th className="w-[150px] px-2 py-2 text-left font-medium">Team</th>
                    <th className="w-[170px] px-2 py-2 text-left font-medium">Members</th>
                    <th className="w-14 px-2 py-2 text-center font-medium">Songs</th>
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot, idx) => {
                    const isSong = !!slot.is_song_slot;
                    return (
                      <React.Fragment key={slot.id}>
                        <tr className="border-t">
                          <td className="px-1 py-1 align-middle">
                            <div className="flex flex-col">
                              <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, -1)} disabled={idx === 0}>
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => reorder(idx, 1)} disabled={idx === slots.length - 1}>
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="px-2 py-1 font-mono text-[11px] text-muted-foreground whitespace-nowrap align-middle">
                            {startTime && slotTimes[idx]?.start ? `${slotTimes[idx].start}–${slotTimes[idx].end}` : "—"}
                          </td>
                          <td className="px-2 py-1 align-middle">
                            <Input
                              className="h-8"
                              defaultValue={slot.title}
                              onBlur={(e) => e.target.value !== slot.title && updateSlot.mutate({ id: slot.id, title: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1 align-middle">
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
                          <td className="px-2 py-1 align-middle">
                            <Select
                              value={slot.default_team_id || "none"}
                              onValueChange={(v) => updateSlot.mutate({ id: slot.id, default_team_id: v === "none" ? null : v, default_profile_ids: [] })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Team" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {teams.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1 align-middle">
                            <MemberPicker
                              slot={slot}
                              onChange={(ids) => updateSlot.mutate({ id: slot.id, default_profile_ids: ids as any })}
                            />
                          </td>
                          <td className="px-2 py-1 text-center align-middle">
                            <Checkbox
                              checked={isSong}
                              onCheckedChange={(v) => updateSlot.mutate({ id: slot.id, is_song_slot: !!v as any })}
                              aria-label="Mark as song slot"
                            />
                          </td>
                          <td className="px-1 py-1 align-middle">
                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => deleteSlot.mutate(slot.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                        {isSong && (
                          <tr className="bg-muted/10">
                            <td></td>
                            <td colSpan={7} className="px-2 pb-2">
                              <SongEditor
                                songs={slot.songs || []}
                                onChange={(songs) => updateSlot.mutate({ id: slot.id, songs: songs as any })}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {slots.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No slots yet. Add one below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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

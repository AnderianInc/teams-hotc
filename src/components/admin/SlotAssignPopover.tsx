import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserPlus, Users, Search } from "lucide-react";
import { useAllTeams } from "@/hooks/useTeams";
import { useInvalidateOoS, type InstanceSlot } from "@/hooks/useOrderOfService";

interface Props {
  slot: InstanceSlot;
  rosterEventId: string | null;
  serviceDate: string;
}

interface Candidate {
  kind: "profile" | "attendee";
  id: string;
  name: string;
  team_id?: string | null;
}

export default function SlotAssignPopover({ slot, rosterEventId, serviceDate }: Props) {
  const invalidate = useInvalidateOoS();
  const { data: teams = [] } = useAllTeams();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState<string>(slot.team_id || "");
  const [mode, setMode] = useState<"team" | "everyone">(slot.team_id ? "team" : "team");
  const [search, setSearch] = useState("");
  const [roleLabel, setRoleLabel] = useState("");

  // Load candidates
  const { data: candidates = [] } = useQuery({
    queryKey: ["slot-candidates", mode, teamId, search],
    enabled: open,
    queryFn: async (): Promise<Candidate[]> => {
      if (mode === "team" && teamId) {
        const { data: members } = await supabase
          .from("team_members")
          .select("user_id")
          .eq("team_id", teamId);
        const ids = (members || []).map((m: any) => m.user_id);
        if (!ids.length) return [];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email")
          .in("user_id", ids)
          .order("full_name");
        return (profiles || []).map((p: any) => ({
          kind: "profile" as const,
          id: p.id,
          name: p.full_name || p.email || "Unknown",
          team_id: teamId,
        }));
      }
      // everyone: search profiles + attendees
      const q = search.trim();
      if (q.length < 2) return [];
      const [{ data: profiles }, { data: attendees }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .ilike("full_name", `%${q}%`)
          .limit(15),
        supabase
          .from("attendees")
          .select("id, first_name, last_name")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
          .limit(15),
      ]);
      return [
        ...(profiles || []).map((p: any) => ({
          kind: "profile" as const,
          id: p.id,
          name: p.full_name || p.email || "Unknown",
        })),
        ...(attendees || []).map((a: any) => ({
          kind: "attendee" as const,
          id: a.id,
          name: `${a.first_name} ${a.last_name}`,
        })),
      ];
    },
  });

  const assign = useMutation({
    mutationFn: async (c: Candidate) => {
      // Best-effort create matching roster_entry if we have team_id + user_id (profile)
      let rosterEntryId: string | null = null;
      if (c.kind === "profile" && rosterEventId && (slot.team_id || teamId)) {
        // Need user_id from profile
        const { data: prof } = await supabase.from("profiles").select("user_id").eq("id", c.id).single();
        if (prof?.user_id) {
          try {
            const { data: entry } = await supabase
              .from("roster_entries")
              .insert({
                team_id: slot.team_id || teamId,
                user_id: prof.user_id,
                event_id: rosterEventId,
                scheduled_date: serviceDate,
                role_description: roleLabel || slot.title,
              })
              .select("id")
              .single();
            rosterEntryId = entry?.id ?? null;
          } catch {
            // team lead may not have permission on that team; that's OK
          }
        }
      }
      const { error } = await supabase.from("service_slot_assignments").insert({
        slot_id: slot.id,
        assignee_type: c.kind,
        profile_id: c.kind === "profile" ? c.id : null,
        attendee_id: c.kind === "attendee" ? c.id : null,
        role_label: roleLabel || null,
        roster_entry_id: rosterEntryId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setRoleLabel("");
      toast.success("Assigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="h-3 w-3 mr-1" /> Assign
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={mode === "team" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("team")}
            >
              <Users className="h-3 w-3 mr-1" /> By team
            </Button>
            <Button
              size="sm"
              variant={mode === "everyone" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("everyone")}
            >
              <Search className="h-3 w-3 mr-1" /> Search all
            </Button>
          </div>

          {mode === "team" ? (
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Search name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}

          <div>
            <Label className="text-xs">Role label (optional)</Label>
            <Input
              placeholder={`e.g. "${slot.title}"`}
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 border-t pt-2">
            {candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">
                {mode === "team" ? "Pick a team to see members" : "Type at least 2 characters"}
              </p>
            ) : (
              candidates.map((c) => (
                <button
                  key={`${c.kind}-${c.id}`}
                  onClick={() => assign.mutate(c)}
                  disabled={assign.isPending}
                  className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent flex items-center justify-between"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.kind}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

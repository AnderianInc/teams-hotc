import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Users, X } from "lucide-react";

interface TeamMembershipEditorProps {
  userId: string;
  enabled?: boolean;
  onChanged?: () => void;
}

interface TeamMembership {
  id: string;
  team_id: string;
  role: string;
  custom_role?: string | null;
  teams: { name: string } | { name: string }[] | null;
}

interface TeamOption {
  id: string;
  name: string;
}

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "team_lead", label: "Team Lead" },
];

const getTeamName = (teams: TeamMembership["teams"]) => {
  if (!teams) return "Team";
  return Array.isArray(teams) ? teams[0]?.name || "Team" : teams.name;
};

export default function TeamMembershipEditor({ userId, enabled = true, onChanged }: TeamMembershipEditorProps) {
  const queryClient = useQueryClient();
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [draftRole, setDraftRole] = useState("member");
  // local state for custom_role inputs keyed by membership id
  const [customRoles, setCustomRoles] = useState<Record<string, string>>({});

  const { data: memberships, isLoading } = useQuery({
    queryKey: ["editable-team-memberships", userId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("team_members")
        .select("id, team_id, role, custom_role, teams(name)")
        .eq("user_id", userId)
        .order("created_at");
      if (error) throw error;
      const rows = (data || []) as TeamMembership[];
      // seed local custom_role state
      const init: Record<string, string> = {};
      rows.forEach((m) => { init[m.id] = m.custom_role ?? ""; });
      setCustomRoles(init);
      return rows;
    },
    enabled: enabled && !!userId,
  });

  const { data: allTeams } = useQuery({
    queryKey: ["membership-editor-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return (data || []) as TeamOption[];
    },
    enabled,
  });

  const syncMembershipQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["editable-team-memberships", userId] });
    queryClient.invalidateQueries({ queryKey: ["all-profiles-with-teams"] });
    queryClient.invalidateQueries({ queryKey: ["team-members"] });
    queryClient.invalidateQueries({ queryKey: ["my-teams"] });
    onChanged?.();
  };

  const addMembershipMutation = useMutation({
    mutationFn: async ({ teamIds, role }: { teamIds: string[]; role: string }) => {
      const rows = teamIds.map((teamId) => ({
        team_id: teamId,
        user_id: userId,
        role: role as "member" | "team_lead",
      }));
      const { error } = await supabase.from("team_members").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team(s) added");
      setSelectedTeamIds(new Set());
      setDraftRole("member");
      syncMembershipQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMembershipMutation = useMutation({
    mutationFn: async ({ membershipId, role, custom_role }: { membershipId: string; role: string; custom_role?: string }) => {
      const update: Record<string, unknown> = { role: role as "member" | "team_lead" };
      if (custom_role !== undefined) update.custom_role = custom_role || null;
      const { error } = await (supabase.from as any)("team_members")
        .update(update)
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      syncMembershipQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMembershipMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from team");
      syncMembershipQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const availableTeams = useMemo(
    () =>
      (allTeams || []).filter(
        (team) => !(memberships || []).some((membership) => membership.team_id === team.id),
      ),
    [allTeams, memberships],
  );

  const isMutating = addMembershipMutation.isPending || updateMembershipMutation.isPending || removeMembershipMutation.isPending;

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 text-sm font-semibold">
        <Users className="h-4 w-4" />
        Team Memberships
      </Label>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading teams...</p>
      ) : memberships && memberships.length > 0 ? (
        <div className="space-y-2">
          {memberships.map((membership) => (
            <div key={membership.id} className="rounded-md border p-2 space-y-2">
              <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                <div className="min-w-0 text-sm font-medium">{getTeamName(membership.teams)}</div>
                <Select
                  value={membership.role}
                  onValueChange={(role) =>
                    updateMembershipMutation.mutate({
                      membershipId: membership.id,
                      role,
                      custom_role: customRoles[membership.id],
                    })
                  }
                  disabled={isMutating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeMembershipMutation.mutate(membership.id)}
                  disabled={isMutating}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Title / Custom Role (optional)"
                value={customRoles[membership.id] ?? ""}
                onChange={(e) =>
                  setCustomRoles((prev) => ({ ...prev, [membership.id]: e.target.value }))
                }
                onBlur={() =>
                  updateMembershipMutation.mutate({
                    membershipId: membership.id,
                    role: membership.role,
                    custom_role: customRoles[membership.id],
                  })
                }
                disabled={isMutating}
                className="text-xs h-7"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not assigned to any teams</p>
      )}

      {availableTeams.length > 0 ? (
        <div className="space-y-2">
          <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
            {availableTeams.map((team) => (
              <label
                key={team.id}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedTeamIds.has(team.id)}
                  onCheckedChange={() => toggleTeam(team.id)}
                  disabled={isMutating}
                />
                <span className="text-sm">{team.name}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Select value={draftRole} onValueChange={setDraftRole}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                addMembershipMutation.mutate({ teamIds: Array.from(selectedTeamIds), role: draftRole })
              }
              disabled={selectedTeamIds.size === 0 || isMutating}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Selected
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Already assigned to all available teams</p>
      )}
    </div>
  );
}

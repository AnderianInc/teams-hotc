import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  const [draftTeamId, setDraftTeamId] = useState("");
  const [draftRole, setDraftRole] = useState("member");

  const { data: memberships, isLoading } = useQuery({
    queryKey: ["editable-team-memberships", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, team_id, role, teams(name)")
        .eq("user_id", userId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as TeamMembership[];
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
    mutationFn: async ({ teamId, role }: { teamId: string; role: string }) => {
      const { error } = await supabase.from("team_members").insert({
        team_id: teamId,
        user_id: userId,
        role: role as "member" | "team_lead",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team added");
      setDraftTeamId("");
      setDraftRole("member");
      syncMembershipQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMembershipMutation = useMutation({
    mutationFn: async ({ membershipId, role }: { membershipId: string; role: string }) => {
      const { error } = await supabase
        .from("team_members")
        .update({ role: role as "member" | "team_lead" })
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
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
            <div key={membership.id} className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
              <div className="min-w-0 text-sm font-medium">{getTeamName(membership.teams)}</div>
              <Select
                value={membership.role}
                onValueChange={(role) => updateMembershipMutation.mutate({ membershipId: membership.id, role })}
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
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not assigned to any teams</p>
      )}

      {availableTeams.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
          <Select value={draftTeamId} onValueChange={setDraftTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Select team..." />
            </SelectTrigger>
            <SelectContent>
              {availableTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={draftRole} onValueChange={setDraftRole}>
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
            variant="outline"
            size="icon"
            onClick={() => addMembershipMutation.mutate({ teamId: draftTeamId, role: draftRole })}
            disabled={!draftTeamId || isMutating}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Already assigned to all available teams</p>
      )}
    </div>
  );
}
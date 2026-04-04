import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

interface TeamRoleTypeManagerProps {
  teamId: string;
}

export function useTeamRoleTypes(teamId: string) {
  return useQuery({
    queryKey: ["team-role-types", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_role_types")
        .select("*")
        .eq("team_id", teamId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export default function TeamRoleTypeManager({ teamId }: TeamRoleTypeManagerProps) {
  const queryClient = useQueryClient();
  const [newRole, setNewRole] = useState("");
  const { data: roleTypes, isLoading } = useTeamRoleTypes(teamId);

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("team_role_types")
        .insert({ team_id: teamId, name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role type added");
      setNewRole("");
      queryClient.invalidateQueries({ queryKey: ["team-role-types", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_role_types")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role type removed");
      queryClient.invalidateQueries({ queryKey: ["team-role-types", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {roleTypes?.map((rt) => (
          <Badge key={rt.id} variant="secondary" className="gap-1 pr-1">
            {rt.name}
            <button
              onClick={() => deleteMutation.mutate(rt.id)}
              className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {(!roleTypes || roleTypes.length === 0) && (
          <span className="text-sm text-muted-foreground">No role types defined yet.</span>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newRole.trim()) addMutation.mutate(newRole.trim());
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="e.g. Sound Board, Camera 1"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={!newRole.trim() || addMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </form>
    </div>
  );
}

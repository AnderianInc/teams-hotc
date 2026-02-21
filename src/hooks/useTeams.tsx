import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  team_type: string;
}

export interface TeamMembership {
  team_id: string;
  role: string;
  teams: Team;
}

export function useMyTeams() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-teams", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("team_id, role, teams:teams(id, name, slug, description)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []) as unknown as TeamMembership[];
    },
  });
}

export function useAllTeams() {
  return useQuery({
    queryKey: ["all-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Team[];
    },
  });
}

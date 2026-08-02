import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const { user, isAdmin } = useAuth();
  return useQuery({
    queryKey: ["my-teams", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("teams")
          .select("*")
          .order("name");
        if (error) throw error;
        return (data || []).map((t) => ({
          team_id: t.id,
          role: "admin",
          teams: t,
        })) as TeamMembership[];
      }
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
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("all-teams-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams" },
        () => queryClient.invalidateQueries({ queryKey: ["all-teams"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["all-teams"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
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


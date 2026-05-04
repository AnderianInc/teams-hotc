import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<AppNotification[]>({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("notifications")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AppNotification[];
    },
  });

  // Realtime subscription so the bell updates instantly
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["notifications", user.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user!.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return { notifications, unreadCount, isLoading, markRead, markAllRead };
}

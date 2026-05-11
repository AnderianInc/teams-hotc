import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, Trash2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function AdminRolesManager() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data: admins, isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, id")
        .eq("role", "admin");
      if (error) throw error;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      return (roles ?? []).map((r) => ({
        ...r,
        profile: profs?.find((p) => p.user_id === r.user_id),
      }));
    },
  });

  const { data: searchResults } = useQuery({
    queryKey: ["admin-search-profiles", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const term = `%${search.trim()}%`;
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .or(`full_name.ilike.${term},email.ilike.${term}`)
        .limit(8);
      if (error) throw error;
      const adminIds = new Set((admins ?? []).map((a) => a.user_id));
      return (data ?? []).filter((p) => !adminIds.has(p.user_id));
    },
  });

  const grantAdmin = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-search-profiles"] });
      setSearch("");
      toast.success("Admin role granted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAdmin = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      toast.success("Admin role revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle>Administrators</CardTitle>
        </div>
        <CardDescription>
          Grant or revoke admin access. Admins can manage all teams, volunteers, and settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Add new admin</label>
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim().length >= 2 && (
            <div className="rounded-md border divide-y">
              {(searchResults ?? []).length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No matching users.</p>
              )}
              {(searchResults ?? []).map((p) => (
                <div key={p.user_id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{p.full_name || "(no name)"}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => grantAdmin.mutate(p.user_id)}
                    disabled={grantAdmin.isPending}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Make admin
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Current admins</label>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="rounded-md border divide-y">
              {(admins ?? []).map((a) => {
                const isSelf = a.user_id === user?.id;
                return (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {a.profile?.full_name || "(no name)"}{" "}
                          {isSelf && <Badge variant="secondary" className="ml-1 text-xs">You</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">{a.profile?.email}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isSelf || revokeAdmin.isPending}
                      onClick={() => {
                        if (confirm(`Revoke admin role from ${a.profile?.full_name || a.profile?.email}?`)) {
                          revokeAdmin.mutate(a.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {(admins ?? []).length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No admins found.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

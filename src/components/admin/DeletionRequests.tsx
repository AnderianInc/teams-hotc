import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X } from "lucide-react";

export default function DeletionRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["deletion-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_deletion_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch profile names for each request
      const userIds = (data as any[]).map((r: any) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      return (data as any[]).map((r: any) => ({
        ...r,
        profile: profiles?.find((p) => p.user_id === r.user_id),
      }));
    },
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("account_deletion_requests" as any)
        .update({ status, reviewed_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast({ title: "Updated", description: `Request ${status}.` });
      queryClient.invalidateQueries({ queryKey: ["deletion-requests"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const pending = (requests || []).filter((r: any) => r.status === "pending");
  const resolved = (requests || []).filter((r: any) => r.status !== "pending");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Account Deletion Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending.length === 0 && resolved.length === 0 && (
          <p className="text-center text-muted-foreground py-4">No deletion requests.</p>
        )}

        {pending.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Pending</h4>
            {pending.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{r.profile?.full_name || "Unknown"} ({r.profile?.email})</p>
                  {r.reason && <p className="text-sm text-muted-foreground mt-0.5">{r.reason}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => updateRequest.mutate({ id: r.id, status: "approved" })}>
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateRequest.mutate({ id: r.id, status: "denied" })}>
                    <X className="h-4 w-4 mr-1" /> Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Resolved</h4>
            {resolved.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 opacity-70">
                <div>
                  <p className="font-medium text-sm">{r.profile?.full_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <Badge variant={r.status === "approved" ? "destructive" : "secondary"}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

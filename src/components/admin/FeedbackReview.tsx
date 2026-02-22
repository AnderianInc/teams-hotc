import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, Send } from "lucide-react";

export default function FeedbackReview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [response, setResponse] = useState("");

  const { data: feedback, isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data as any[]).map((f: any) => f.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const teamIds = [...new Set((data as any[]).filter((f: any) => f.team_id).map((f: any) => f.team_id))];
      let teams: any[] = [];
      if (teamIds.length > 0) {
        const { data: t } = await supabase.from("teams").select("id, name").in("id", teamIds);
        teams = t || [];
      }

      return (data as any[]).map((f: any) => ({
        ...f,
        profile_name: profiles?.find((p) => p.user_id === f.user_id)?.full_name || "Unknown",
        team_name: teams.find((t) => t.id === f.team_id)?.name,
      }));
    },
  });

  const respond = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("feedback" as any)
        .update({ admin_response: response, status: "resolved", responded_at: new Date().toISOString() } as any)
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Response Sent" });
      setSelected(null);
      setResponse("");
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const open = (feedback || []).filter((f: any) => f.status === "open");
  const resolved = (feedback || []).filter((f: any) => f.status === "resolved");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feedback ({open.length} open)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {open.length === 0 && resolved.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No feedback yet.</p>
          )}

          {open.map((fb: any) => (
            <div key={fb.id} className="rounded-lg border p-3 space-y-1 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => { setSelected(fb); setResponse(fb.admin_response || ""); }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{fb.subject}</span>
                <Badge variant="secondary" className="text-xs">{fb.category}</Badge>
                {fb.team_name && <Badge variant="outline" className="text-xs">{fb.team_name}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{fb.message}</p>
              <p className="text-xs text-muted-foreground">{fb.profile_name} · {new Date(fb.created_at).toLocaleDateString()}</p>
            </div>
          ))}

          {resolved.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-muted-foreground pt-2">Resolved</h4>
              {resolved.map((fb: any) => (
                <div key={fb.id} className="rounded-lg border p-3 opacity-70 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{fb.subject}</span>
                    <Badge className="text-xs">resolved</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{fb.profile_name} · {new Date(fb.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.subject}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Badge variant="secondary">{selected?.category}</Badge>
              {selected?.team_name && <Badge variant="outline">{selected?.team_name}</Badge>}
            </div>
            <p className="text-sm">{selected?.message}</p>
            <p className="text-xs text-muted-foreground">From {selected?.profile_name} · {selected && new Date(selected.created_at).toLocaleDateString()}</p>

            <div className="space-y-2 pt-2">
              <label className="text-sm font-medium">Admin Response</label>
              <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={3} placeholder="Write a response..." />
              <Button onClick={() => respond.mutate()} disabled={respond.isPending || !response.trim()}>
                <Send className="mr-2 h-4 w-4" />
                {respond.isPending ? "Sending..." : "Send & Resolve"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

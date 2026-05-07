import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, ArrowRight, Calendar } from "lucide-react";

const STAGES = [
  { key: "interested", label: "Interested", color: "bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800" },
  { key: "invited", label: "Invited", color: "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800" },
  { key: "visited", label: "Visited", color: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800" },
  { key: "connected", label: "Connected", color: "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800" },
  { key: "member", label: "Member", color: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800" },
] as const;

type Stage = typeof STAGES[number]["key"];

export default function OutreachPipeline() {
  const queryClient = useQueryClient();

  const { data: pipeline = [], isLoading } = useQuery({
    queryKey: ["outreach-pipeline"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("follow_ups")
        .select("*, attendees(first_name, last_name, first_visit_date, email, phone), profiles:assigned_to(full_name)")
        .eq("type", "outreach")
        .not("prospect_pipeline_stage", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Also pull first-time visitors with no pipeline entry yet
  const { data: recentVisitors = [] } = useQuery({
    queryKey: ["recent-first-visitors"],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("attendees")
        .select("id, first_name, last_name, first_visit_date, email")
        .eq("is_member", false)
        .not("first_visit_date", "is", null)
        .gte("first_visit_date", sevenDaysAgo)
        .order("first_visit_date", { ascending: false });
      if (error) throw error;

      // Filter to those not already in pipeline
      const pipelineAttendeeIds = new Set(pipeline.map((p: any) => p.attendee_id));
      return (data ?? []).filter((v) => !pipelineAttendeeIds.has(v.id));
    },
    enabled: pipeline.length >= 0,
  });

  const advanceStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const { error } = await (supabase.from as any)("follow_ups")
        .update({ prospect_pipeline_stage: stage })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-pipeline"] });
      toast.success("Stage updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addToPipeline = useMutation({
    mutationFn: async (attendeeId: string) => {
      const { error } = await (supabase.from as any)("follow_ups").insert({
        attendee_id: attendeeId,
        type: "outreach",
        prospect_pipeline_stage: "visited",
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-pipeline", "recent-first-visitors", "follow-ups"] });
      toast.success("Added to pipeline");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byStage = (stage: Stage) => pipeline.filter((p: any) => p.prospect_pipeline_stage === stage);

  const daysSince = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return diff;
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading pipeline…</div>;

  return (
    <div className="space-y-6">
      {/* Recent visitors not yet in pipeline */}
      {recentVisitors.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Recent First-Time Visitors — Not Yet in Pipeline ({recentVisitors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recentVisitors.map((v: any) => (
                <div key={v.id} className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background">
                  <span className="text-sm font-medium">{v.first_name} {v.last_name}</span>
                  {v.first_visit_date && (
                    <span className="text-xs text-muted-foreground">{daysSince(v.first_visit_date)}d ago</span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => addToPipeline.mutate(v.id)}
                    disabled={addToPipeline.isPending}
                  >
                    Add to pipeline
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {STAGES.map((stage, idx) => {
          const items = byStage(stage.key);
          const nextStage = STAGES[idx + 1];
          return (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{stage.label}</h4>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {items.map((item: any) => {
                  const days = daysSince(item.attendees?.first_visit_date);
                  return (
                    <div key={item.id} className={`rounded-lg border p-3 text-sm ${stage.color} space-y-1`}>
                      <p className="font-medium leading-tight">
                        {item.attendees?.first_name} {item.attendees?.last_name}
                      </p>
                      {days !== null && (
                        <p className="text-xs text-muted-foreground">{days}d since first visit</p>
                      )}
                      {item.profiles?.full_name && (
                        <p className="text-xs text-muted-foreground">→ {item.profiles.full_name}</p>
                      )}
                      {nextStage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs w-full mt-1"
                          onClick={() => advanceStage.mutate({ id: item.id, stage: nextStage.key as Stage })}
                          disabled={advanceStage.isPending}
                        >
                          <ArrowRight className="h-3 w-3 mr-1" /> Move to {nextStage.label}
                        </Button>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        {pipeline.length} people in pipeline across all stages
      </div>
    </div>
  );
}

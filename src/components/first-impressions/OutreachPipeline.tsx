import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, ArrowRight, Calendar, Trash2 } from "lucide-react";

const STAGES = [
  { key: "interested", label: "Interested", color: "bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800" },
  { key: "invited", label: "Invited", color: "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800" },
  { key: "visited", label: "Visited", color: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800" },
  { key: "connected", label: "Connected", color: "bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800" },
  { key: "member", label: "Member", color: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800" },
] as const;

type Stage = typeof STAGES[number]["key"];

const SOURCE_META: Record<string, { label: string; className: string }> = {
  "source:prayer-request": { label: "Prayer", className: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  "source:visit-request": { label: "Visit", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  "source:interest-meeting": { label: "Interest", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
};

function SourceBadges({ tags }: { tags?: string[] | null }) {
  if (!tags?.length) return null;
  const sources = tags.filter((t) => SOURCE_META[t]);
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((t) => (
        <Badge key={t} variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${SOURCE_META[t].className}`}>
          {SOURCE_META[t].label}
        </Badge>
      ))}
    </div>
  );
}

export default function OutreachPipeline() {
  const queryClient = useQueryClient();

  const { data: pipeline = [], isLoading, error: pipelineError } = useQuery({
    queryKey: ["outreach-pipeline"],
    staleTime: 30_000,
    queryFn: async () => {
      // profiles:assigned_to would need an FK to profiles.user_id; since assigned_to
      // references auth.users, we fetch assignee names via a separate profiles query
      const { data, error } = await (supabase.from as any)("follow_ups")
        .select("*, attendees(first_name, last_name, first_visit_date, email, phone, tags)")
        .eq("type", "outreach")
        .not("prospect_pipeline_stage", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const profileMap = new Map(allProfiles.map((p: any) => [p.user_id, p.full_name]));

  // Pull first-time visitors not yet in pipeline — server-side exclusion avoids race condition
  const { data: recentVisitors = [] } = useQuery({
    queryKey: ["recent-first-visitors"],
    staleTime: 30_000,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      // Get all attendee IDs already in the pipeline
      const { data: pipelineIds } = await (supabase.from as any)("follow_ups")
        .select("attendee_id")
        .eq("type", "outreach")
        .not("prospect_pipeline_stage", "is", null);
      const excludeIds: string[] = (pipelineIds ?? []).map((r: any) => r.attendee_id);

      let q = supabase
        .from("attendees")
        .select("id, first_name, last_name, first_visit_date, email")
        .eq("is_member", false)
        .not("first_visit_date", "is", null)
        .gte("first_visit_date", sevenDaysAgo)
        .order("first_visit_date", { ascending: false });

      if (excludeIds.length > 0) {
        q = q.not("id", "in", `(${excludeIds.join(",")})`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const advanceStage = useMutation({
    mutationFn: async ({ id, stage, attendeeId }: { id: string; stage: Stage; attendeeId: string }) => {
      const { error } = await (supabase.from as any)("follow_ups")
        .update({ prospect_pipeline_stage: stage })
        .eq("id", id);
      if (error) throw error;

      // Sync attendee membership flag with pipeline stage
      const { error: memberError } = await supabase
        .from("attendees")
        .update({ is_member: stage === "member" })
        .eq("id", attendeeId);
      if (memberError) throw memberError;
    },
    onSuccess: (_data, { stage }) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["attendees"] });
      queryClient.invalidateQueries({ queryKey: ["fi-attendees"] });
      if (stage === "member") {
        toast.success("Moved to Member — visitor record updated");
      } else {
        toast.success("Stage updated — visitor status synced");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addToPipeline = useMutation({
    mutationFn: async (attendeeId: string) => {
      // If an outreach follow-up already exists for this attendee, attach it to the
      // pipeline instead of inserting a duplicate row.
      const { data: existing } = await (supabase.from as any)("follow_ups")
        .select("id")
        .eq("attendee_id", attendeeId)
        .eq("type", "outreach")
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await (supabase.from as any)("follow_ups")
          .update({ prospect_pipeline_stage: "visited" })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("follow_ups").insert({
          attendee_id: attendeeId,
          type: "outreach",
          prospect_pipeline_stage: "visited",
          status: "pending",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["recent-first-visitors"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      toast.success("Added to pipeline");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFromPipeline = useMutation({
    mutationFn: async (id: string) => {
      const { data: deleted, error } = await (supabase.from as any)("follow_ups")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Delete was blocked — ensure the follow_ups delete policy migration has been applied in Supabase");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["recent-first-visitors"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      toast.success("Removed from pipeline");
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
  if (pipelineError) return <div className="py-8 text-center text-destructive text-sm">Failed to load pipeline: {(pipelineError as Error).message}</div>;

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
                      <SourceBadges tags={item.attendees?.tags} />
                      {days !== null && (
                        <p className="text-xs text-muted-foreground">{days}d since first visit</p>
                      )}
                      {item.assigned_to && profileMap.get(item.assigned_to) && (
                        <p className="text-xs text-muted-foreground">→ {profileMap.get(item.assigned_to)}</p>
                      )}
                      <div className="flex gap-1 mt-1">
                        {nextStage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs flex-1"
                            onClick={() => advanceStage.mutate({ id: item.id, stage: nextStage.key as Stage, attendeeId: item.attendee_id })}
                            disabled={advanceStage.isPending}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" /> {nextStage.label}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Remove ${item.attendees?.first_name} from pipeline?`)) {
                              removeFromPipeline.mutate(item.id);
                            }
                          }}
                          disabled={removeFromPipeline.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
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

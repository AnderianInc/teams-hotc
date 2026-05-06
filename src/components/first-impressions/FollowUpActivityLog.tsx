import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Phone, Mail, MessageSquare, MapPin, FileText, RefreshCw, Plus, X } from "lucide-react";

type ActivityRow = Database["public"]["Tables"]["follow_up_activities"]["Row"] & {
  profiles: { full_name: string } | null;
};

const activityIcons: Record<string, React.ElementType> = {
  note: FileText,
  call: Phone,
  email: Mail,
  text: MessageSquare,
  visit: MapPin,
  status_change: RefreshCw,
};

const activityLabels: Record<string, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  text: "Text",
  visit: "Visit",
  status_change: "Status change",
};

interface Props {
  followUpId: string;
}

export function FollowUpActivityLog({ followUpId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [activityType, setActivityType] = useState("note");
  const [content, setContent] = useState("");

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["follow-up-activities", followUpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_up_activities")
        .select("*, profiles:actor_id(full_name)")
        .eq("follow_up_id", followUpId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ActivityRow[];
    },
  });

  const addActivity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("follow_up_activities").insert({
        follow_up_id: followUpId,
        actor_id: user!.id,
        activity_type: activityType as ActivityRow["activity_type"],
        content: content.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdding(false);
      setContent("");
      setActivityType("note");
      queryClient.invalidateQueries({ queryKey: ["follow-up-activities", followUpId] });
      toast.success("Activity logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Activity Log</p>
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 mr-1" /> Log
          </Button>
        )}
      </div>

      {adding && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <Select value={activityType} onValueChange={setActivityType}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(activityLabels).filter(([k]) => k !== "status_change").map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Add notes about this interaction…"
            rows={2}
            className="text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => addActivity.mutate()} disabled={addActivity.isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No activity logged yet.</p>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-3">
          {activities.map((a) => {
            const Icon = activityIcons[a.activity_type] || FileText;
            return (
              <li key={a.id} className="ml-4">
                <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-muted border">
                  <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                </span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{activityLabels[a.activity_type]}</span>
                  <span>by {a.profiles?.full_name ?? "—"}</span>
                  <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                </div>
                {a.content && <p className="text-sm mt-0.5">{a.content}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

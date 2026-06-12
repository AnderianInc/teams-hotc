import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Trash2, Users, QrCode, Plus, Search } from "lucide-react";

const STAGES = [
  { key: "interested", label: "Interested", color: "bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800" },
  { key: "training", label: "Training", color: "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800" },
  { key: "volunteer", label: "Volunteer", color: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800" },
] as const;

type Stage = typeof STAGES[number]["key"];

const JOIN_URL = "https://teams.hotc.life/join-team";

export default function VolunteerOnboardingPipeline() {
  const qc = useQueryClient();
  const [showQr, setShowQr] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAttendee, setSelectedAttendee] = useState<any | null>(null);
  const [addStage, setAddStage] = useState<Stage>("interested");
  const [addTeams, setAddTeams] = useState<string[]>([]);
  const [addNotes, setAddNotes] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["volunteer-onboarding"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("volunteer_onboarding")
        .select("*, attendees(first_name, last_name, email, phone, tags)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams-list"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, name");
      return data || [];
    },
  });
  const teamName = (id: string) => (teams as any[]).find((t) => t.id === id)?.name || "Team";

  const setStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const patch: Record<string, unknown> = { stage };
      if (stage === "volunteer") patch.completed_at = new Date().toISOString();
      else patch.completed_at = null;
      const { error } = await (supabase.from as any)("volunteer_onboarding").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volunteer-onboarding"] });
      toast.success("Stage updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("volunteer_onboarding").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volunteer-onboarding"] });
      toast.success("Removed from pipeline");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byStage = useMemo(() => {
    const map: Record<Stage, any[]> = { interested: [], training: [], volunteer: [] };
    for (const r of rows as any[]) {
      const s = (r.stage as Stage) || "interested";
      if (map[s]) map[s].push(r);
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Users className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Volunteer Onboarding</h2>
            <p className="text-sm text-muted-foreground">Interested → Training → Volunteer</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowQr((s) => !s)}>
          <QrCode className="h-4 w-4 mr-1" /> Join-team QR
        </Button>
      </div>

      {showQr && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share the Join Team QR code</CardTitle>
            <CardDescription>Anyone who scans lands on /join-team. We assume they're already a visitor and match them in our directory.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="p-4 bg-white rounded-xl border">
              <QRCodeSVG value={JOIN_URL} size={180} level="H" />
            </div>
            <p className="text-sm text-muted-foreground break-all">{JOIN_URL}</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STAGES.map((stage, idx) => {
            const items = byStage[stage.key];
            const prev = STAGES[idx - 1];
            const next = STAGES[idx + 1];
            return (
              <div key={stage.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">{stage.label}</h4>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {items.map((item: any) => (
                    <div key={item.id} className={`rounded-lg border p-3 text-sm space-y-2 ${stage.color}`}>
                      <p className="font-medium leading-tight">
                        {item.attendees?.first_name} {item.attendees?.last_name}
                      </p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {item.attendees?.email && <div>{item.attendees.email}</div>}
                        {item.attendees?.phone && <div>{item.attendees.phone}</div>}
                      </div>
                      {item.preferred_team_ids?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.preferred_team_ids.map((tid: string) => (
                            <Badge key={tid} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {teamName(tid)}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {item.notes && <p className="text-xs italic text-muted-foreground line-clamp-3">{item.notes}</p>}
                      <div className="flex gap-1 pt-1">
                        {prev && (
                          <Button size="sm" variant="ghost" className="h-7 px-1.5"
                            onClick={() => setStage.mutate({ id: item.id, stage: prev.key as Stage })}
                            disabled={setStage.isPending}>
                            <ArrowLeft className="h-3 w-3" />
                          </Button>
                        )}
                        {next && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs flex-1"
                            onClick={() => setStage.mutate({ id: item.id, stage: next.key as Stage })}
                            disabled={setStage.isPending}>
                            <ArrowRight className="h-3 w-3 mr-1" /> {next.label}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Remove ${item.attendees?.first_name} from onboarding?`)) {
                              removeRow.mutate(item.id);
                            }
                          }}
                          disabled={removeRow.isPending}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
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
      )}

      <p className="text-xs text-muted-foreground">
        Cards land in <strong>Interested</strong> automatically when someone submits the /join-team form. Move them through Training and Volunteer as they progress. Reaching <strong>Volunteer</strong> marks the row complete — assign the person to a team via the Teams page.
      </p>
    </div>
  );
}

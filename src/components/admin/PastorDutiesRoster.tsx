import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, BookOpen, Plus, Trash2, Pencil } from "lucide-react";
import { format, addWeeks, subWeeks, isSunday, nextSunday, startOfDay } from "date-fns";
import { toast } from "sonner";
import { assertUserAvailableForRoster, getRosterResponseLabel } from "@/lib/rosterAvailability";

function getUpcomingSunday(date = new Date()): Date {
  const d = startOfDay(date);
  return isSunday(d) ? d : nextSunday(d);
}

export default function PastorDutiesRoster() {
  const queryClient = useQueryClient();
  const [sunday, setSunday] = useState<Date>(() => getUpcomingSunday());
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [addPastorId, setAddPastorId] = useState("");
  const [addDuty, setAddDuty] = useState("");

  // Edit state
  const [editEntry, setEditEntry] = useState<any>(null);
  const [editPastorId, setEditPastorId] = useState("");
  const [editDuty, setEditDuty] = useState("");

  const sundayStr = format(sunday, "yyyy-MM-dd");

  const { data: pastoralTeams } = useQuery({
    queryKey: ["pastoral-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name")
        .eq("team_type", "pastoral")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (pastoralTeams && pastoralTeams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(pastoralTeams[0].id);
    }
  }, [pastoralTeams, selectedTeamId]);

  const teamId = selectedTeamId || pastoralTeams?.[0]?.id || "";

  const { data: pastors } = useQuery({
    queryKey: ["pastoral-members", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name, email)")
        .eq("team_id", teamId);
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });

  const PRESET_DUTIES = [
    "Welcome",
    "Opening Prayer",
    "Worship Lead",
    "Announcements",
    "Offering",
    "Scripture Reading",
    "Teaching",
    "Sermon",
    "Altar Call",
    "Communion",
    "Closing",
    "Benediction",
  ];

  const { data: duties, isLoading } = useQuery({
    queryKey: ["pastor-duties", teamId, sundayStr],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("roster_entries")
        .select("id, user_id, role_description, response_status, decline_reason, profiles:user_id(full_name)")
        .eq("team_id", teamId)
        .eq("scheduled_date", sundayStr)
        .is("event_id", null);
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });

  const addDutyMutation = useMutation({
    mutationFn: async () => {
      if (!teamId || !addPastorId || !addDuty.trim()) {
        throw new Error("Select a pastor and enter a duty");
      }
      const pastor = (pastors as any)?.find((p: any) => p.user_id === addPastorId);
      const pastorName = pastor?.profiles?.full_name || "This pastor";
      await assertUserAvailableForRoster(addPastorId, sundayStr, pastorName);

      const { error } = await supabase.from("roster_entries").insert({
        team_id: teamId,
        user_id: addPastorId,
        scheduled_date: sundayStr,
        role_description: addDuty.trim(),
        event_id: null,
      });
      if (error) throw error;

      // Notify the pastor (in-app/push + email)
      const pastorEmail = pastor?.profiles?.email as string | undefined;
      const dateStr = format(sunday, "EEEE, MMMM d, yyyy");

      try {
        await supabase.functions.invoke("notify", {
          body: {
            recipient_id: addPastorId,
            type: "roster_assigned",
            title: `You've been assigned a Sunday duty`,
            body: `${dateStr} · ${addDuty.trim()}`,
            url: "/",
            high_priority: true,
          },
        });
      } catch (err) { console.error("notify failed", err); }

      if (pastorEmail) {
        try {
          await supabase.functions.invoke("send-email", {
            body: {
              to: pastorEmail,
              to_name: pastorName,
              subject: `Sunday duty assigned for ${dateStr}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2>Hi ${pastorName},</h2>
                <p>You've been assigned a Sunday duty.</p>
                <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
                  <p style="margin:4px 0;"><strong>Date:</strong> ${dateStr}</p>
                  <p style="margin:4px 0;"><strong>Duty:</strong> ${addDuty.trim()}</p>
                </div>
                <p>You can accept or decline this assignment from your dashboard at <a href="https://teams.hotc.life">teams.hotc.life</a>.</p>
                <p>— House of Transformation Church</p>
              </div>`,
            },
          });
        } catch (err) { console.error("email failed", err); }
      }
    },
    onSuccess: () => {
      toast.success("Duty assigned & pastor notified");
      setAddOpen(false);
      setAddPastorId("");
      setAddDuty("");
      queryClient.invalidateQueries({ queryKey: ["pastor-duties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDutyMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from("roster_entries").delete().eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Duty removed");
      queryClient.invalidateQueries({ queryKey: ["pastor-duties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDutyMutation = useMutation({
    mutationFn: async () => {
      if (!editPastorId || !editDuty.trim()) throw new Error("Select a pastor and enter a duty");
      const pastor = (pastors as any)?.find((p: any) => p.user_id === editPastorId);
      await assertUserAvailableForRoster(editPastorId, sundayStr, pastor?.profiles?.full_name || "This pastor");

      const { error } = await supabase.from("roster_entries")
        .update({ user_id: editPastorId, role_description: editDuty.trim() })
        .eq("id", editEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Duty updated");
      setEditEntry(null);
      queryClient.invalidateQueries({ queryKey: ["pastor-duties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validPastoralTeams = (pastoralTeams || []).filter((t: any) => t.id);
  const validPastors = (pastors || []).filter((p: any) => p.user_id);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" /> Pastor Duties Roster
              </CardTitle>
              <CardDescription>Assign Sunday duties to pastors</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {validPastoralTeams.length > 1 && (
                <Select value={teamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {validPastoralTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="icon" onClick={() => setSunday((s) => subWeeks(s, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[220px] text-center">
                {format(sunday, "EEEE, MMMM d, yyyy")}
              </span>
              <Button variant="outline" size="icon" onClick={() => setSunday((s) => addWeeks(s, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!teamId}>
              <Plus className="h-4 w-4 mr-1" /> Assign Duty
            </Button>
          </div>

          {!teamId ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              No pastoral teams found. Create a team with type "Pastoral" first.
            </p>
          ) : isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : duties && duties.length > 0 ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pastor</TableHead>
                    <TableHead>Duty</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duties.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium text-sm">
                        {(d.profiles as any)?.full_name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        {d.role_description ? (
                          <div className="flex flex-wrap gap-1">
                            {d.role_description.split(",").map((duty: string, i: number) => (
                              <Badge key={i} variant="secondary">{duty.trim()}</Badge>
                            ))}
                            <Badge
                              variant={d.response_status === "declined" ? "destructive" : d.response_status === "accepted" ? "default" : "outline"}
                              className="text-xs"
                            >
                              {getRosterResponseLabel(d.response_status)}
                            </Badge>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-muted-foreground text-sm">—</span>
                            <Badge
                              variant={d.response_status === "declined" ? "destructive" : d.response_status === "accepted" ? "default" : "outline"}
                              className="text-xs"
                            >
                              {getRosterResponseLabel(d.response_status)}
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { setEditEntry(d); setEditPastorId(d.user_id); setEditDuty(d.role_description || ""); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                            onClick={() => removeDutyMutation.mutate(d.id)}
                            disabled={removeDutyMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <p className="text-sm">No duties assigned for this Sunday.</p>
              <p className="text-xs mt-1">Click "Assign Duty" to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Duty — {format(sunday, "MMMM d, yyyy")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); addDutyMutation.mutate(); }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Pastor</Label>
              <Select value={addPastorId} onValueChange={setAddPastorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pastor" />
                </SelectTrigger>
                <SelectContent>
                  {validPastors.map((p: any) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {(p.profiles as any)?.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Duties (select one or more)</Label>
              <Input
                placeholder="Custom duty (or select presets below)"
                value={addDuty}
                onChange={(e) => setAddDuty(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {PRESET_DUTIES.map((d) => {
                  const list = addDuty.split(",").map((x) => x.trim()).filter(Boolean);
                  const selected = list.includes(d);
                  return (
                    <Badge
                      key={d}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        const next = selected ? list.filter((x) => x !== d) : [...list, d];
                        setAddDuty(next.join(", "));
                      }}
                    >
                      {d}
                    </Badge>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Tap presets to toggle. Multiple duties saved together.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={addDutyMutation.isPending || !addPastorId || !addDuty.trim()}
            >
              {addDutyMutation.isPending ? "Saving..." : "Assign Duty"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit duty dialog */}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Duty — {format(sunday, "MMMM d, yyyy")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateDutyMutation.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Pastor</Label>
              <Select value={editPastorId} onValueChange={setEditPastorId}>
                <SelectTrigger><SelectValue placeholder="Select pastor" /></SelectTrigger>
                <SelectContent>
                  {validPastors.map((p: any) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {(p.profiles as any)?.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duties (select one or more)</Label>
              <Input
                placeholder="Custom duty (or select presets below)"
                value={editDuty}
                onChange={(e) => setEditDuty(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {PRESET_DUTIES.map((d) => {
                  const list = editDuty.split(",").map((x) => x.trim()).filter(Boolean);
                  const selected = list.includes(d);
                  return (
                    <Badge
                      key={d}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        const next = selected ? list.filter((x) => x !== d) : [...list, d];
                        setEditDuty(next.join(", "));
                      }}
                    >
                      {d}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <Button
              type="submit" className="w-full"
              disabled={updateDutyMutation.isPending || !editPastorId || !editDuty.trim()}
            >
              {updateDutyMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

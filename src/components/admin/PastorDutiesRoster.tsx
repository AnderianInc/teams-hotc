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
        .select("user_id, profiles:user_id(full_name)")
        .eq("team_id", teamId);
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });

  const { data: dutyTypes } = useQuery({
    queryKey: ["pastoral-duty-types", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("team_role_types")
        .select("id, name")
        .eq("team_id", teamId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });

  const { data: duties, isLoading } = useQuery({
    queryKey: ["pastor-duties", teamId, sundayStr],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await supabase
        .from("roster_entries")
        .select("id, user_id, role_description, profiles:user_id(full_name)")
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
      const { error } = await supabase.from("roster_entries").insert({
        team_id: teamId,
        user_id: addPastorId,
        scheduled_date: sundayStr,
        role_description: addDuty.trim(),
        event_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Duty assigned");
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

  const hasDutyTypes = dutyTypes && dutyTypes.length > 0;

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
              {pastoralTeams && pastoralTeams.length > 1 && (
                <Select value={teamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {pastoralTeams.map((t) => (
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
                          <Badge variant="secondary">{d.role_description}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
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
                  {(pastors || []).filter((p: any) => p.user_id).map((p: any) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {(p.profiles as any)?.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Duty</Label>
              {hasDutyTypes ? (
                <Select value={addDuty} onValueChange={setAddDuty}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duty" />
                  </SelectTrigger>
                  <SelectContent>
                    {dutyTypes.filter((dt: any) => dt.name && dt.name.trim()).map((dt: any) => (
                      <SelectItem key={dt.id} value={dt.name}>{dt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-1">
                  <Input
                    placeholder="e.g. Sermon, Opening Prayer, Altar Call"
                    value={addDuty}
                    onChange={(e) => setAddDuty(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Add duty types in the team's Role Types tab to use a dropdown here.
                  </p>
                </div>
              )}
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
                  {(pastors || []).map((p: any) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {(p.profiles as any)?.full_name || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Duty</Label>
              {hasDutyTypes ? (
                <Select value={editDuty} onValueChange={setEditDuty}>
                  <SelectTrigger><SelectValue placeholder="Select duty" /></SelectTrigger>
                  <SelectContent>
                    {dutyTypes.map((dt: any) => (
                      <SelectItem key={dt.id} value={dt.name}>{dt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="e.g. Sermon, Opening Prayer, Altar Call"
                  value={editDuty}
                  onChange={(e) => setEditDuty(e.target.value)}
                />
              )}
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useAllTeams, Team } from "@/hooks/useTeams";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function TeamManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: teams, isLoading } = useAllTeams();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamType, setTeamType] = useState<string>("volunteer");

  const [editOpen, setEditOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editType, setEditType] = useState<string>("volunteer");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);

  const addTeam = useMutation({
    mutationFn: async () => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { error } = await supabase.from("teams").insert({ name, slug, description: description || null, team_type: teamType });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team created!");
      setAddOpen(false);
      setName("");
      setDescription("");
      setTeamType("volunteer");
      queryClient.invalidateQueries({ queryKey: ["all-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTeam = useMutation({
    mutationFn: async () => {
      if (!editTeam) return;
      const { error } = await supabase.from("teams").update({ team_type: editType, name: editName, description: editDescription || null }).eq("id", editTeam.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team updated!");
      setEditOpen(false);
      setEditTeam(null);
      queryClient.invalidateQueries({ queryKey: ["all-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team deleted!");
      setDeleteTeam(null);
      queryClient.invalidateQueries({ queryKey: ["all-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Teams</CardTitle>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new team</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTeam.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Team Name</Label>
                <Input placeholder="e.g. Prayer Team" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Team Type</Label>
                <RadioGroup value={teamType} onValueChange={setTeamType} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="volunteer" id="type-volunteer" />
                    <Label htmlFor="type-volunteer" className="font-normal">Volunteer</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="ministry" id="type-ministry" />
                    <Label htmlFor="type-ministry" className="font-normal">Ministry</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  placeholder="What does this team do?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={addTeam.isPending}>
                {addTeam.isPending ? "Creating..." : "Create Team"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams?.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <button
                      onClick={() => navigate(`/team/${t.slug}`)}
                      className="font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {t.name}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.team_type === "ministry" ? "default" : "secondary"} className="capitalize text-xs">
                      {t.team_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.description || "—"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditTeam(t); setEditName(t.name); setEditDescription(t.description || ""); setEditType(t.team_type); setEditOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTeam(t)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Team</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); updateTeam.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Team Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Team Type</Label>
                <RadioGroup value={editType} onValueChange={setEditType} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="volunteer" id="edit-type-volunteer" />
                    <Label htmlFor="edit-type-volunteer" className="font-normal">Volunteer</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="ministry" id="edit-type-ministry" />
                    <Label htmlFor="edit-type-ministry" className="font-normal">Ministry</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={updateTeam.isPending}>
                {updateTeam.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTeam} onOpenChange={(open) => !open && setDeleteTeam(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTeam?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently remove this team and all its member associations. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTeam && removeTeam.mutate(deleteTeam.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

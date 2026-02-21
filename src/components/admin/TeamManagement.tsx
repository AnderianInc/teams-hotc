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
import { Plus, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAllTeams } from "@/hooks/useTeams";

export default function TeamManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: teams, isLoading } = useAllTeams();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const addTeam = useMutation({
    mutationFn: async () => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { error } = await supabase.from("teams").insert({ name, slug, description: description || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team created!");
      setAddOpen(false);
      setName("");
      setDescription("");
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

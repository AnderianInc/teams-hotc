import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, X, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface DirectoryEntry {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  date_of_birth: string | null;
  isVolunteer: boolean;
  isVolunteerOnly: boolean;
  tags: string[] | null;
  teamNames: string[];
  source?: "attendee" | "family";
}

interface Props {
  entry: DirectoryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export default function DirectoryEditDialog({ entry, open, onOpenChange, onUpdated }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    first_name: entry.first_name,
    last_name: entry.last_name,
    email: entry.email || "",
    phone: entry.phone || "",
    date_of_birth: entry.date_of_birth || "",
    is_member: entry.is_member,
  });
  const [saving, setSaving] = useState(false);
  const [addTeamId, setAddTeamId] = useState("");
  const [addTeamRole, setAddTeamRole] = useState("member");

  // Find the user_id for this entry (needed for team management)
  const isAttendee = entry.source !== "family" && !entry.isVolunteerOnly;
  const isVolunteerOnly = entry.isVolunteerOnly;

  // Get user_id: for volunteerOnly it's entry.id, for attendees we look up profile
  const { data: profileData } = useQuery({
    queryKey: ["profile-for-entry", entry.id, entry.isVolunteerOnly],
    queryFn: async () => {
      if (isVolunteerOnly) {
        return { user_id: entry.id };
      }
      // Look up profile by attendee_id
      const { data } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("attendee_id", entry.id)
        .maybeSingle();
      return data;
    },
    enabled: open && entry.source !== "family",
  });

  const userId = profileData?.user_id;

  // Get current team memberships
  const { data: currentTeams, refetch: refetchTeams } = useQuery({
    queryKey: ["entry-teams", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, team_id, role, teams(name)")
        .eq("user_id", userId!);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && open,
  });

  // Get all available teams
  const { data: allTeams } = useQuery({
    queryKey: ["all-teams-for-edit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: open && entry.source !== "family",
  });

  const availableTeams = (allTeams || []).filter(
    (t) => !(currentTeams || []).some((ct: any) => ct.team_id === t.id)
  );

  const addTeamMutation = useMutation({
    mutationFn: async ({ teamId, role }: { teamId: string; role: string }) => {
      const { error } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, user_id: userId!, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to team");
      setAddTeamId("");
      setAddTeamRole("member");
      refetchTeams();
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTeamMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from team");
      refetchTeams();
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (field: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (entry.source === "family") {
        const { error } = await supabase
          .from("children")
          .update({
            first_name: form.first_name,
            last_name: form.last_name,
            date_of_birth: form.date_of_birth || null,
          })
          .eq("id", entry.id);
        if (error) throw error;
      } else if (entry.isVolunteerOnly) {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: `${form.first_name} ${form.last_name}`.trim(),
            email: form.email || "",
            phone: form.phone || null,
            date_of_birth: form.date_of_birth || null,
          })
          .eq("user_id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendees")
          .update({
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email || null,
            phone: form.phone || null,
            date_of_birth: form.date_of_birth || null,
            is_member: form.is_member,
          })
          .eq("id", entry.id);
        if (error) throw error;
      }
      toast.success("Entry updated");
      onUpdated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Failed to update: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {entry.first_name} {entry.last_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First Name</Label>
              <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Last Name</Label>
              <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </div>
          </div>
          {entry.source !== "family" && (
            <>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>Date of Birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} />
          </div>
          {entry.source !== "family" && !entry.isVolunteerOnly && (
            <div className="flex items-center gap-3">
              <Switch checked={form.is_member} onCheckedChange={(v) => update("is_member", v)} />
              <Label>Member</Label>
            </div>
          )}

          {/* Team Management Section */}
          {entry.source !== "family" && userId && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4" />
                  Team Memberships
                </Label>

                {/* Current teams */}
                {currentTeams && currentTeams.length > 0 ? (
                  <div className="space-y-1">
                    {currentTeams.map((tm: any) => (
                      <div key={tm.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{(tm.teams as any)?.name}</span>
                          <Badge variant={tm.role === "team_lead" ? "default" : "secondary"} className="text-xs capitalize">
                            {tm.role === "team_lead" ? "Lead" : "Member"}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeTeamMutation.mutate(tm.id)}
                          disabled={removeTeamMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not assigned to any teams</p>
                )}

                {/* Add to team */}
                {availableTeams.length > 0 && (
                  <div className="flex gap-2">
                    <Select value={addTeamId} onValueChange={setAddTeamId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select team..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTeams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={addTeamRole} onValueChange={setAddTeamRole}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="team_lead">Lead</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={!addTeamId || addTeamMutation.isPending}
                      onClick={() => addTeamMutation.mutate({ teamId: addTeamId, role: addTeamRole })}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

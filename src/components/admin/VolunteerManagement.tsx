import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Mail, RefreshCw, Pencil, MoreHorizontal, Trash2 } from "lucide-react";
import { useAllTeams } from "@/hooks/useTeams";

interface ProfileWithTeam {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  team_members: { team_id: string; role: string; teams: { id: string; name: string } }[];
}

export default function VolunteerManagement() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeam, setInviteTeam] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const [editOpen, setEditOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<ProfileWithTeam | null>(null);
  const [editTeam, setEditTeam] = useState("");
  const [editRole, setEditRole] = useState("member");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProfile, setDeleteProfile] = useState<ProfileWithTeam | null>(null);

  const { data: teams } = useAllTeams();

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all-profiles-with-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, created_at, team_members(team_id, role, teams:teams(id, name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ProfileWithTeam[];
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, teamId, role }: { email: string; teamId: string; role: string }) => {
      const { error } = await supabase.functions.invoke("invite-volunteer", {
        body: { email, teamId, role },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invite sent!");
      setInviteOpen(false);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["all-profiles-with-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendMutation = useMutation({
    mutationFn: async ({ email, teamId, role }: { email: string; teamId: string; role: string }) => {
      const { error } = await supabase.functions.invoke("invite-volunteer", {
        body: { email, teamId, role },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invite resent!");
      queryClient.invalidateQueries({ queryKey: ["all-profiles-with-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ userId, oldTeamId, newTeamId, newRole }: { userId: string; oldTeamId: string; newTeamId: string; newRole: string }) => {
      if (oldTeamId !== newTeamId) {
        await supabase.from("team_members").delete().eq("user_id", userId).eq("team_id", oldTeamId);
      }
      const { error } = await supabase.from("team_members").upsert(
        { user_id: userId, team_id: newTeamId, role: newRole as any },
        { onConflict: "team_id,user_id" } as any
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated!");
      setEditOpen(false);
      setEditProfile(null);
      queryClient.invalidateQueries({ queryKey: ["all-profiles-with-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from("team_members").delete().eq("user_id", userId);
      const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Volunteer removed!");
      setDeleteOpen(false);
      setDeleteProfile(null);
      queryClient.invalidateQueries({ queryKey: ["all-profiles-with-teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPending = (p: ProfileWithTeam) => !p.full_name || p.full_name.trim() === "";

  const openEdit = (p: ProfileWithTeam) => {
    setEditProfile(p);
    const firstMembership = p.team_members?.[0];
    setEditTeam(firstMembership?.team_id || "");
    setEditRole(firstMembership?.role || "member");
    setEditOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Volunteers</CardTitle>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Volunteer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a Volunteer</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                inviteMutation.mutate({ email: inviteEmail, teamId: inviteTeam, role: inviteRole });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="volunteer@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Assign to Team</Label>
                <Select value={inviteTeam} onValueChange={setInviteTeam} required>
                  <SelectTrigger><SelectValue placeholder="Select a team" /></SelectTrigger>
                  <SelectContent>
                    {teams?.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="team_lead">Team Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={inviteMutation.isPending}>
                <Mail className="h-4 w-4 mr-2" />
                {inviteMutation.isPending ? "Sending..." : "Send Invite"}
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
                <TableHead>Email</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {p.team_members?.map((tm) => (
                        <Badge key={tm.team_id} variant="secondary">{(tm.teams as any)?.name || "Team"}</Badge>
                      ))}
                      {(!p.team_members || p.team_members.length === 0) && <span className="text-muted-foreground text-sm">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isPending(p) ? (
                      <Badge variant="outline" className="text-warning border-warning">Pending</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 row-actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {isPending(p) && (
                          <DropdownMenuItem
                            disabled={resendMutation.isPending}
                            onClick={() => {
                              const firstTeam = p.team_members?.[0];
                              resendMutation.mutate({
                                email: p.email,
                                teamId: firstTeam?.team_id || "",
                                role: firstTeam?.role || "member",
                              });
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Resend Invite
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => { setDeleteProfile(p); setDeleteOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {(!profiles || profiles.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No volunteers yet. Invite your first volunteer above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Volunteer — {editProfile?.full_name || editProfile?.email}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editProfile) return;
                const oldTeamId = editProfile.team_members?.[0]?.team_id || "";
                editMutation.mutate({ userId: editProfile.user_id, oldTeamId, newTeamId: editTeam, newRole: editRole });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Team</Label>
                <Select value={editTeam} onValueChange={setEditTeam}>
                  <SelectTrigger><SelectValue placeholder="Select a team" /></SelectTrigger>
                  <SelectContent>
                    {teams?.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="team_lead">Team Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={editMutation.isPending}>
                {editMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteProfile?.full_name || deleteProfile?.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this volunteer and their team memberships. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteMutation.isPending}
                onClick={() => deleteProfile && deleteMutation.mutate(deleteProfile.user_id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

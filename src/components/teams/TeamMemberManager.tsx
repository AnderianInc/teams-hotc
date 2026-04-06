import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Mail, Trash2, Shield, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface TeamMemberManagerProps {
  teamId: string;
  teamName: string;
}

export default function TeamMemberManager({ teamId, teamName }: TeamMemberManagerProps) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [removeMember, setRemoveMember] = useState<any>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*, profiles:user_id(full_name, email)")
        .eq("team_id", teamId);
      if (error) throw error;
      return data;
    },
  });

  // Get all team memberships for these members to show multi-team info
  const memberUserIds = (members || []).map((m: any) => m.user_id);
  const { data: allMemberships } = useQuery({
    queryKey: ["all-memberships-for-members", memberUserIds],
    queryFn: async () => {
      if (memberUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, team_id, role, teams(name)")
        .in("user_id", memberUserIds)
        .neq("team_id", teamId);
      if (error) throw error;
      return data;
    },
    enabled: memberUserIds.length > 0,
  });

  const getOtherTeams = (userId: string) =>
    (allMemberships || []).filter((m: any) => m.user_id === userId);

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-volunteer", {
        body: { email, teamId, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success("Invite sent!");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      queryClient.invalidateQueries({ queryKey: ["team-members", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: string }) => {
      const { error } = await supabase
        .from("team_members")
        .update({ role: newRole as any })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["team-members", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member removed from team");
      queryClient.invalidateQueries({ queryKey: ["team-members", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Team Members</CardTitle>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite to {teamName}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="volunteer@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="team_lead">Team Lead</SelectItem>
                    {isAdmin && <SelectItem value="admin">Admin</SelectItem>}
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Other Teams</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((m: any) => {
              const otherTeams = getOtherTeams(m.user_id);
              return (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.profiles?.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{m.profiles?.email || "—"}</TableCell>
                <TableCell>
                  <Badge variant={m.role === "team_lead" ? "default" : "secondary"} className="capitalize text-xs">
                    {m.role === "team_lead" ? "Team Lead" : "Member"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {otherTeams.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {otherTeams.map((ot: any) => (
                        <Badge key={ot.team_id} variant="outline" className="text-xs">
                          {(ot.teams as any)?.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 row-actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.role !== "team_lead" && (
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ memberId: m.id, newRole: "team_lead" })}>
                          <Shield className="h-4 w-4 mr-2" />
                          Promote to Lead
                        </DropdownMenuItem>
                      )}
                      {m.role === "team_lead" && (
                        <DropdownMenuItem onClick={() => updateRoleMutation.mutate({ memberId: m.id, newRole: "member" })}>
                          <Shield className="h-4 w-4 mr-2" />
                          Set as Member
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setRemoveMember(m)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {(!members || members.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No members yet. Invite your first team member above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={!!removeMember} onOpenChange={(open) => !open && setRemoveMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removeMember?.profiles?.full_name || "this member"} from {teamName}? They can be re-invited later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { removeMutation.mutate(removeMember.id); setRemoveMember(null); }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

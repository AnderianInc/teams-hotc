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
import { UserPlus, Mail, RefreshCw, MoreHorizontal, Trash2, Download, Search, UserCheck, Pencil } from "lucide-react";
import { downloadCsv } from "@/lib/csvExport";
import { useAllTeams } from "@/hooks/useTeams";
import EditVolunteerDialog from "./EditVolunteerDialog";

interface ProfileWithTeam {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  team_members: { team_id: string; role: string; teams: { id: string; name: string } }[];
}

interface SearchResult {
  user_id: string;
  full_name: string;
  email: string;
}

export default function VolunteerManagement() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeam, setInviteTeam] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [searchQuery, setSearchQuery] = useState("");

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

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ["volunteer-search", searchQuery],
    queryFn: async () => {
      const term = `%${searchQuery}%`;
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .or(`full_name.ilike.${term},email.ilike.${term}`)
        .limit(8);
      return (data ?? []) as SearchResult[];
    },
    enabled: searchQuery.length >= 2,
  });

  const addFromDbMutation = useMutation({
    mutationFn: async ({ userId, teamId, role }: { userId: string; teamId: string; role: string }) => {
      const { error } = await supabase.from("team_members").insert({
        user_id: userId,
        team_id: teamId,
        role: role as "member" | "team_lead",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Volunteer added to team!");
      queryClient.invalidateQueries({ queryKey: ["all-profiles-with-teams"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  const isAlreadyMember = (userId: string, teamId: string) => {
    const profile = profiles?.find((p) => p.user_id === userId);
    return profile?.team_members?.some((tm) => tm.team_id === teamId) ?? false;
  };

  const exportCsv = () => {
    const rows = (profiles ?? []).map((p) => ({
      name: p.full_name,
      email: p.email,
      teams: p.team_members.map((tm) => tm.teams?.name).filter(Boolean).join("; "),
      roles: p.team_members.map((tm) => tm.role).join("; "),
      joined: p.created_at ? p.created_at.split("T")[0] : "",
    }));
    downloadCsv("volunteers.csv", rows);
  };

  const handleInviteOpenChange = (open: boolean) => {
    setInviteOpen(open);
    if (!open) {
      setSearchQuery("");
      setInviteEmail("");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Volunteers</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!profiles?.length}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Dialog open={inviteOpen} onOpenChange={handleInviteOpenChange}>
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
            <div className="space-y-4">
              {/* Shared: Team + Role pickers */}
              <div className="space-y-2">
                <Label>Assign to Team</Label>
                <Select value={inviteTeam} onValueChange={setInviteTeam}>
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

              {/* Search existing volunteers */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Search className="h-4 w-4" />
                  Search Existing Volunteers
                </Label>
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery.length >= 2 && (
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                    {isSearching ? (
                      <div className="p-3 text-sm text-center text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline mr-1" />
                        Searching...
                      </div>
                    ) : searchResults && searchResults.length > 0 ? (
                      searchResults.map((result) => {
                        const alreadyMember = inviteTeam ? isAlreadyMember(result.user_id, inviteTeam) : false;
                        return (
                          <div key={result.user_id} className="flex items-center justify-between p-2 gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{result.full_name || "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">{result.email}</div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!inviteTeam || alreadyMember || addFromDbMutation.isPending}
                              onClick={() =>
                                addFromDbMutation.mutate({
                                  userId: result.user_id,
                                  teamId: inviteTeam,
                                  role: inviteRole,
                                })
                              }
                            >
                              <UserCheck className="h-3 w-3 mr-1" />
                              {alreadyMember ? "Already added" : "Add"}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 text-sm text-center text-muted-foreground">No volunteers found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or invite by email</span>
                </div>
              </div>

              {/* Invite by email */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  inviteMutation.mutate({ email: inviteEmail, teamId: inviteTeam, role: inviteRole });
                }}
                className="space-y-3"
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
                <Button type="submit" className="w-full" disabled={inviteMutation.isPending || !inviteTeam}>
                  <Mail className="h-4 w-4 mr-2" />
                  {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                </Button>
              </form>
            </div>
          </DialogContent>
        </Dialog>
        </div>
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
                        {isPending(p) && (
                          <>
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
                            <DropdownMenuSeparator />
                          </>
                        )}
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

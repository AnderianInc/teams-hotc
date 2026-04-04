import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calendar, Users, Plus, Settings } from "lucide-react";
import TeamMemberManager from "@/components/teams/TeamMemberManager";
import TeamRoleTypeManager, { useTeamRoleTypes } from "@/components/teams/TeamRoleTypeManager";

interface VolunteerTeamDashboardProps {
  teamId: string;
  teamName: string;
  teamSlug: string;
  hideHeader?: boolean;
}

export default function VolunteerTeamDashboard({ teamId, teamName, teamSlug, hideHeader }: VolunteerTeamDashboardProps) {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{teamName}</h1>
          <p className="text-muted-foreground mt-1">Team dashboard</p>
        </div>
      )}

      <Tabs defaultValue="members" className="w-full">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="roster">
            <Calendar className="h-4 w-4 mr-2" />
            Roster
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Settings className="h-4 w-4 mr-2" />
            Role Types
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <TeamMemberManager teamId={teamId} teamName={teamName} />
        </TabsContent>
        <TabsContent value="roster">
          <RosterSchedule teamId={teamId} />
        </TabsContent>
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Manage Role Types</CardTitle>
              <p className="text-sm text-muted-foreground">
                Define the positions/roles available for this team (e.g. Sound Board, Videography, Lead Vocal).
              </p>
            </CardHeader>
            <CardContent>
              <TeamRoleTypeManager teamId={teamId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RosterSchedule({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [date, setDate] = useState("");
  const [userId, setUserId] = useState("");
  const [roleDesc, setRoleDesc] = useState("");

  const { data: roster, isLoading } = useQuery({
    queryKey: ["roster", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roster_entries")
        .select("*, profiles:user_id(full_name)")
        .eq("team_id", teamId)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["team-members-for-roster", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, profiles:user_id(full_name)")
        .eq("team_id", teamId);
      if (error) throw error;
      return data;
    },
  });

  const { data: roleTypes } = useTeamRoleTypes(teamId);

  const addEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("roster_entries").insert({
        team_id: teamId,
        user_id: userId,
        scheduled_date: date,
        role_description: roleDesc || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Roster entry added!");
      setAddOpen(false);
      setDate(""); setUserId(""); setRoleDesc("");
      queryClient.invalidateQueries({ queryKey: ["roster", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const grouped = (roster || []).reduce((acc: Record<string, any[]>, entry: any) => {
    const d = entry.scheduled_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(entry);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Schedule</CardTitle>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add to Roster
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Roster Entry</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addEntry.mutate(); }} className="space-y-4">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Team Member</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                >
                  <option value="">Select member</option>
                  {members?.map((m: any) => (
                    <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || "Unknown"}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Role/Position</Label>
                {roleTypes && roleTypes.length > 0 ? (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={roleDesc}
                    onChange={(e) => setRoleDesc(e.target.value)}
                  >
                    <option value="">Select role (optional)</option>
                    {roleTypes.map((rt) => (
                      <option key={rt.id} value={rt.name}>{rt.name}</option>
                    ))}
                  </select>
                ) : (
                  <Input placeholder="e.g. Lead Vocal, Camera 1" value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} />
                )}
              </div>
              <Button type="submit" className="w-full" disabled={addEntry.isPending}>
                {addEntry.isPending ? "Adding..." : "Add Entry"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No roster entries yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort().map(([dateStr, entries]) => (
              <div key={dateStr}>
                <h4 className="font-display font-semibold text-sm text-muted-foreground mb-2">
                  {new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </h4>
                <div className="space-y-1">
                  {(entries as any[]).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="font-medium text-sm">{e.profiles?.full_name || "Unknown"}</span>
                      {e.role_description && (
                        <Badge variant="outline" className="text-xs">{e.role_description}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

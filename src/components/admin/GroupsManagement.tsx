import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Heart, Users, Plus, Trash2, Search, UserPlus, CalendarDays, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

type GroupType = "small_group" | "life_group";

const LIFE_GROUP_CATEGORIES = [
  "Young Adults",
  "Married Couples",
  "Parents",
  "Singles",
  "Seniors",
  "Men's Ministry",
  "Women's Ministry",
  "Grief & Loss",
  "Recovery",
  "Career & Finance",
  "New Believers",
] as const;

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function GroupsManagement() {
  const queryClient = useQueryClient();

  // Create/Edit group state
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<GroupType>("small_group");
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formLeaderId, setFormLeaderId] = useState("");
  const [formMeetingDay, setFormMeetingDay] = useState("");
  const [formMeetingTime, setFormMeetingTime] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formIsOpen, setFormIsOpen] = useState(true);

  // Detail / member management state
  const [detailGroup, setDetailGroup] = useState<any>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [addMemberSearch, setAddMemberSearch] = useState("");

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("groups")
        .select("*, leader:leader_id(full_name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ["group-members", detailGroup?.id],
    queryFn: async () => {
      if (!detailGroup) return [];
      const { data, error } = await (supabase.from as any)("group_members")
        .select("*, attendee:attendee_id(id, first_name, last_name, email)")
        .eq("group_id", detailGroup.id)
        .order("joined_at");
      if (error) throw error;
      return data;
    },
    enabled: !!detailGroup?.id,
  });

  const { data: attendeeSearchResults = [] } = useQuery({
    queryKey: ["attendee-search", addMemberSearch],
    queryFn: async () => {
      if (addMemberSearch.trim().length < 2) return [];
      const { data, error } = await supabase
        .from("attendees")
        .select("id, first_name, last_name, email")
        .or(`first_name.ilike.%${addMemberSearch}%,last_name.ilike.%${addMemberSearch}%`)
        .eq("is_member", true)
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: addMemberSearch.trim().length >= 2,
  });

  const { data: leaders = [] } = useQuery({
    queryKey: ["profiles-leaders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      if (!formName.trim()) throw new Error("Name is required");
      if (createType === "small_group" && !formLocation.trim()) throw new Error("Location is required for Small Groups");
      if (createType === "life_group" && !formCategory.trim()) throw new Error("Category is required for Life Groups");

      const { error } = await (supabase.from as any)("groups").insert({
        name: formName.trim(),
        description: formDesc.trim() || null,
        group_type: createType,
        location: createType === "small_group" ? formLocation.trim() || null : null,
        category: createType === "life_group" ? formCategory.trim() || null : null,
        leader_id: formLeaderId || null,
        meeting_day: formMeetingDay || null,
        meeting_time: formMeetingTime || null,
        meeting_address: formAddress.trim() || null,
        max_capacity: formCapacity ? parseInt(formCapacity) : null,
        is_open: formIsOpen,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group created");
      setCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group deleted");
      setDetailGroup(null);
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMember = useMutation({
    mutationFn: async (attendeeId: string) => {
      const { error } = await (supabase.from as any)("group_members").insert({
        group_id: detailGroup.id,
        attendee_id: attendeeId,
        role: "member",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member added");
      setAddMemberSearch("");
      queryClient.invalidateQueries({ queryKey: ["group-members", detailGroup?.id] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase.from as any)("group_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: ["group-members", detailGroup?.id] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetForm() {
    setFormName(""); setFormDesc(""); setFormLocation(""); setFormCategory("");
    setFormLeaderId(""); setFormMeetingDay(""); setFormMeetingTime("");
    setFormAddress(""); setFormCapacity(""); setFormIsOpen(true);
  }

  function openCreate(type: GroupType) {
    resetForm();
    setCreateType(type);
    setCreateOpen(true);
  }

  const smallGroups = groups.filter((g: any) => g.group_type === "small_group");
  const lifeGroups  = groups.filter((g: any) => g.group_type === "life_group");

  const filteredGroupMembers = groupMembers.filter((m: any) => {
    if (!memberSearch) return true;
    const name = `${m.attendee?.first_name} ${m.attendee?.last_name}`.toLowerCase();
    return name.includes(memberSearch.toLowerCase());
  });

  const alreadyInGroup = new Set(groupMembers.map((m: any) => m.attendee_id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
          <Users className="h-4 w-4 text-violet-600" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold">Groups</h2>
          <p className="text-sm text-muted-foreground">Manage small groups (by location) and life groups (by life need)</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-blue-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{smallGroups.length}</p>
              <p className="text-xs text-muted-foreground">Small Groups</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <Heart className="h-5 w-5 text-rose-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{lifeGroups.length}</p>
              <p className="text-xs text-muted-foreground">Life Groups</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="small_groups">
        <TabsList>
          <TabsTrigger value="small_groups">
            <MapPin className="h-4 w-4 mr-1.5" />
            Small Groups
          </TabsTrigger>
          <TabsTrigger value="life_groups">
            <Heart className="h-4 w-4 mr-1.5" />
            Life Groups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="small_groups" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Organized around location — neighborhoods, districts, or areas.</p>
            <Button size="sm" onClick={() => openCreate("small_group")}>
              <Plus className="h-4 w-4 mr-1" /> New Small Group
            </Button>
          </div>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : smallGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No small groups yet. Create one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {smallGroups.map((g: any) => (
                <GroupCard key={g.id} group={g} onOpen={() => setDetailGroup(g)} onDelete={() => deleteGroup.mutate(g.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="life_groups" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Organized around life needs — stage of life, personal journey, or shared experience.</p>
            <Button size="sm" onClick={() => openCreate("life_group")}>
              <Plus className="h-4 w-4 mr-1" /> New Life Group
            </Button>
          </div>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : lifeGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No life groups yet. Create one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lifeGroups.map((g: any) => (
                <GroupCard key={g.id} group={g} onOpen={() => setDetailGroup(g)} onDelete={() => deleteGroup.mutate(g.id)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create group dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Create {createType === "small_group" ? "Small Group" : "Life Group"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createGroup.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input placeholder={createType === "small_group" ? "e.g. Northside Small Group" : "e.g. Young Adults Life Group"} value={formName} onChange={(e) => setFormName(e.target.value)} required />
            </div>

            {createType === "small_group" ? (
              <div className="space-y-1">
                <Label>Location / Neighborhood *</Label>
                <Input placeholder="e.g. Northside, Downtown, Eastville" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} required />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Life Need / Category *</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>
                    {LIFE_GROUP_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="__other__">Other (type below)</SelectItem>
                  </SelectContent>
                </Select>
                {formCategory === "__other__" && (
                  <Input className="mt-1" placeholder="Describe the life need…" onChange={(e) => setFormCategory(e.target.value)} />
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea placeholder="What is this group about?" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Meeting Day</Label>
                <Select value={formMeetingDay} onValueChange={setFormMeetingDay}>
                  <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Meeting Time</Label>
                <Input type="time" value={formMeetingTime} onChange={(e) => setFormMeetingTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Meeting Address</Label>
              <Input placeholder="123 Main St, City" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Leader</Label>
                <Select value={formLeaderId} onValueChange={setFormLeaderId}>
                  <SelectTrigger><SelectValue placeholder="No leader yet" /></SelectTrigger>
                  <SelectContent>
                    {leaders.map((l: any) => (
                      <SelectItem key={l.user_id} value={l.user_id}>{l.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Max Capacity</Label>
                <Input type="number" min="1" placeholder="Unlimited" value={formCapacity} onChange={(e) => setFormCapacity(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_open" checked={formIsOpen} onChange={(e) => setFormIsOpen(e.target.checked)} className="rounded" />
              <Label htmlFor="is_open" className="cursor-pointer">Open for new members</Label>
            </div>

            <Button type="submit" className="w-full" disabled={createGroup.isPending}>
              {createGroup.isPending ? "Creating..." : "Create Group"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Group detail / member management dialog */}
      <Dialog open={!!detailGroup} onOpenChange={(o) => !o && setDetailGroup(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailGroup && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detailGroup.group_type === "small_group" ? <MapPin className="h-4 w-4 text-blue-500" /> : <Heart className="h-4 w-4 text-rose-500" />}
                  {detailGroup.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-1 text-sm text-muted-foreground">
                {detailGroup.group_type === "small_group" && detailGroup.location && (
                  <p><span className="font-medium text-foreground">Location:</span> {detailGroup.location}</p>
                )}
                {detailGroup.group_type === "life_group" && detailGroup.category && (
                  <p><span className="font-medium text-foreground">Category:</span> {detailGroup.category}</p>
                )}
                {detailGroup.meeting_day && (
                  <p className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {detailGroup.meeting_day}{detailGroup.meeting_time ? ` at ${detailGroup.meeting_time}` : ""}
                    {detailGroup.meeting_address ? ` · ${detailGroup.meeting_address}` : ""}
                  </p>
                )}
                {detailGroup.leader?.full_name && (
                  <p><span className="font-medium text-foreground">Leader:</span> {detailGroup.leader.full_name}</p>
                )}
                {detailGroup.description && <p>{detailGroup.description}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant={detailGroup.is_open ? "default" : "secondary"} className="text-xs gap-1">
                    {detailGroup.is_open ? <Unlock className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                    {detailGroup.is_open ? "Open" : "Closed"}
                  </Badge>
                  {detailGroup.max_capacity && (
                    <Badge variant="outline" className="text-xs">{groupMembers.length}/{detailGroup.max_capacity} members</Badge>
                  )}
                </div>
              </div>

              {/* Add member search */}
              <div className="space-y-2 border-t pt-4">
                <Label className="flex items-center gap-1"><UserPlus className="h-4 w-4" /> Add Member</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search members by name…"
                    value={addMemberSearch}
                    onChange={(e) => setAddMemberSearch(e.target.value)}
                  />
                </div>
                {attendeeSearchResults.length > 0 && (
                  <div className="border rounded-md divide-y max-h-[140px] overflow-y-auto">
                    {(attendeeSearchResults as any[]).map((a) => {
                      const already = alreadyInGroup.has(a.id);
                      return (
                        <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span>{a.first_name} {a.last_name} {a.email && <span className="text-muted-foreground text-xs">({a.email})</span>}</span>
                          {already ? (
                            <Badge variant="secondary" className="text-xs">Already added</Badge>
                          ) : (
                            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => addMember.mutate(a.id)}>Add</Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {addMemberSearch.trim().length >= 2 && attendeeSearchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No members found. Make sure they're in the church directory.</p>
                )}
              </div>

              {/* Member list */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1"><Users className="h-4 w-4" /> Members ({groupMembers.length})</Label>
                  {groupMembers.length > 4 && (
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input className="pl-7 h-7 text-xs w-44" placeholder="Filter…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                    </div>
                  )}
                </div>
                {groupMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No members yet. Use the search above to add some.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGroupMembers.map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm font-medium">
                            {m.attendee ? `${m.attendee.first_name} ${m.attendee.last_name}` : "Unknown"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(m.joined_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeMember.mutate(m.id)} disabled={removeMember.isPending}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button variant="destructive" size="sm" onClick={() => deleteGroup.mutate(detailGroup.id)} disabled={deleteGroup.isPending}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Group
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupCard({ group, onOpen, onDelete }: { group: any; onOpen: () => void; onDelete: () => void }) {
  const isSmall = group.group_type === "small_group";
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
      onClick={onOpen}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{group.name}</CardTitle>
          <Badge variant={group.is_open ? "default" : "secondary"} className="text-[10px] shrink-0">
            {group.is_open ? "Open" : "Closed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {isSmall && group.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3 text-blue-400" /> {group.location}
          </p>
        )}
        {!isSmall && group.category && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Heart className="h-3 w-3 text-rose-400" /> {group.category}
          </p>
        )}
        {group.meeting_day && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> {group.meeting_day}{group.meeting_time ? ` · ${group.meeting_time}` : ""}
          </p>
        )}
        {group.leader?.full_name && (
          <p className="text-xs text-muted-foreground">Leader: {group.leader.full_name}</p>
        )}
      </CardContent>
    </Card>
  );
}

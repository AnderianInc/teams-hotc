import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, MoreHorizontal, Trash2, Pencil, Heart } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import DirectoryDeleteButton from "./DirectoryDeleteButton";
import DirectoryEditDialog from "./DirectoryEditDialog";
import DirectoryRelationships from "./DirectoryRelationships";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface DirectoryEntry {
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
  familyChildren?: { id: string; first_name: string; last_name: string }[];
}

function DirectoryActionMenu({ entry, onRefresh }: { entry: DirectoryEntry; onRefresh: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const isFamily = entry.source === "family";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 row-actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          {!isFamily && (
            <DropdownMenuItem onClick={() => setRelOpen(true)}>
              <Heart className="h-4 w-4 mr-2" /> Relationships
            </DropdownMenuItem>
          )}
          {!isFamily && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DirectoryEditDialog entry={entry} open={editOpen} onOpenChange={setEditOpen} onUpdated={onRefresh} />
      {!isFamily && (
        <>
          <DirectoryDeleteButton
            entryId={entry.id}
            entryName={`${entry.first_name} ${entry.last_name}`}
            isVolunteerOnly={entry.isVolunteerOnly}
            onDeleted={onRefresh}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
          <DirectoryRelationships
            attendeeId={entry.id}
            attendeeName={`${entry.first_name} ${entry.last_name}`}
            open={relOpen}
            onOpenChange={setRelOpen}
          />
        </>
      )}
    </>
  );
}

export default function ChurchDirectory() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDirectory = useCallback(async () => {
    setLoading(true);

    // Fetch attendees, profiles, team members, AND families+children in parallel
    const [attendeesRes, profilesRes, teamMembersRes, familiesRes, childrenRes] = await Promise.all([
      supabase.from("attendees").select("id, first_name, last_name, email, phone, is_member, tags, date_of_birth").order("last_name"),
      supabase.from("profiles").select("attendee_id, user_id, full_name, email"),
      supabase.from("team_members").select("user_id, teams:teams(name)"),
      supabase.from("families").select("id, family_name, parent1_name, parent1_phone"),
      supabase.from("children").select("id, first_name, last_name, family_id, date_of_birth"),
    ]);

    const attendees = attendeesRes.data || [];
    const profiles = profilesRes.data || [];
    const teamMembers = teamMembersRes.data || [];
    const families = familiesRes.data || [];
    const children = childrenRes.data || [];

    // Build team map
    const userTeamMap = new Map<string, string[]>();
    const usersWithTeams = new Set<string>();
    teamMembers.forEach((tm: any) => {
      const names = userTeamMap.get(tm.user_id) || [];
      if (tm.teams?.name) names.push(tm.teams.name);
      userTeamMap.set(tm.user_id, names);
      usersWithTeams.add(tm.user_id);
    });

    // Build profile maps
    const profilesByAttendeeId = new Map<string, any>();
    const unlinkedProfiles: any[] = [];
    profiles.forEach((p) => {
      if (p.attendee_id) profilesByAttendeeId.set(p.attendee_id, p);
      else unlinkedProfiles.push(p);
    });

    // Build attendee entries
    const result: DirectoryEntry[] = attendees.map((a) => {
      const profile = profilesByAttendeeId.get(a.id);
      return {
        ...a,
        isVolunteer: !!profile,
        isVolunteerOnly: false,
        teamNames: profile ? (userTeamMap.get(profile.user_id) || []) : [],
        source: "attendee" as const,
      };
    });

    // Add unlinked profile entries
    unlinkedProfiles.forEach((p) => {
      const hasTeams = usersWithTeams.has(p.user_id);
      const nameParts = (p.full_name || "").trim().split(/\s+/);
      result.push({
        id: p.user_id,
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        email: p.email || null,
        phone: null,
        is_member: false,
        date_of_birth: null,
        isVolunteer: hasTeams,
        isVolunteerOnly: hasTeams,
        tags: null,
        teamNames: userTeamMap.get(p.user_id) || [],
        source: "attendee",
      });
    });

    // Add family entries (grouped) — always show families with children
    const childrenByFamily = new Map<string, typeof children>();
    children.forEach((c) => {
      const list = childrenByFamily.get(c.family_id) || [];
      list.push(c);
      childrenByFamily.set(c.family_id, list);
    });

    families.forEach((fam) => {
      const famChildren = childrenByFamily.get(fam.id) || [];
      if (famChildren.length === 0) return;

      result.push({
        id: fam.id,
        first_name: fam.family_name,
        last_name: "(Family)",
        email: null,
        phone: fam.parent1_phone,
        is_member: false,
        date_of_birth: null,
        isVolunteer: false,
        isVolunteerOnly: false,
        tags: null,
        teamNames: [],
        source: "family",
        familyChildren: famChildren.map((c) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
        })),
      });
    });

    result.sort((a, b) => {
      const aName = a.source === "family" ? a.first_name : a.last_name;
      const bName = b.source === "family" ? b.first_name : b.last_name;
      return aName.localeCompare(bName);
    });
    setEntries(result);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDirectory(); }, [fetchDirectory]);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const fields = [e.first_name, e.last_name, e.email, e.phone, ...e.teamNames];
    if (fields.some((f) => f?.toLowerCase().includes(q))) return true;
    if (e.familyChildren?.some((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q))) return true;
    return false;
  });

  const formatBirthday = (dob: string | null) => {
    if (!dob) return "—";
    try { return format(parseISO(dob), "MMM d"); } catch { return "—"; }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Church Directory
          </CardTitle>
          <Badge variant="secondary">{entries.length} people</Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading directory...</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Birthday</TableHead>
                  <TableHead>Team(s)</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">
                      No members found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((entry) => (
                    <TableRow
                      key={`${entry.source}-${entry.id}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        if (entry.source === "family") navigate(`/admin/directory/family/${entry.id}`);
                        else if (!entry.isVolunteerOnly) navigate(`/admin/directory/${entry.id}`);
                      }}
                    >
                      <TableCell className="font-medium">
                        {entry.source === "family" ? (
                          <div>
                            <span>{entry.first_name} Family</span>
                            {entry.familyChildren && entry.familyChildren.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {entry.familyChildren.map((c) => `${c.first_name} ${c.last_name}`).join(", ")}
                              </div>
                            )}
                          </div>
                        ) : (
                          `${entry.first_name} ${entry.last_name}`
                        )}
                      </TableCell>
                      <TableCell>{entry.email || "—"}</TableCell>
                      <TableCell>{entry.phone || "—"}</TableCell>
                      <TableCell>{formatBirthday(entry.date_of_birth)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {entry.teamNames.length > 0
                            ? entry.teamNames.map((t) => (
                                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                              ))
                            : <span className="text-muted-foreground text-sm">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {entry.source === "family" ? (
                            <Badge variant="outline" className="text-xs">Kids Ministry</Badge>
                          ) : (
                            <>
                              {entry.is_member && <Badge variant="default">Member</Badge>}
                              {entry.isVolunteer && <Badge variant="secondary">Volunteer</Badge>}
                              {!entry.is_member && !entry.isVolunteer && <Badge variant="outline">Visitor</Badge>}
                              {entry.tags?.includes("first-timer") && (
                                <Badge variant="outline" className="text-warning border-warning">First Timer</Badge>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      {isAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DirectoryActionMenu entry={entry} onRefresh={fetchDirectory} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

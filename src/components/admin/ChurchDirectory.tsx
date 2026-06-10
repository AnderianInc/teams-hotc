import { useEffect, useState, useCallback, useMemo } from "react";
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
import FamilyDeleteDialog from "./FamilyDeleteDialog";
import DirectoryEditDialog from "./DirectoryEditDialog";
import DirectoryRelationships from "./DirectoryRelationships";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FilterChips } from "@/components/filters/FilterChips";
import { FilterPopover, type FacetSection } from "@/components/filters/FilterPopover";
import { ActiveFilterBar } from "@/components/filters/ActiveFilterBar";
import { useTableFilters } from "@/hooks/useTableFilters";
import { formatPhoneDisplay } from "@/lib/phone";
import { bulkDeleteDirectoryEntries } from "@/lib/directoryDelete";


export type PipelineStage = "interested" | "invited" | "visited" | "connected" | "member";

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
  isStaff?: boolean;
  staffTitle?: string | null;
  smsOptIn?: boolean;
  pipelineStage?: PipelineStage | null;
  hasFirstVisit?: boolean;
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
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DirectoryEditDialog entry={entry} open={editOpen} onOpenChange={setEditOpen} onUpdated={onRefresh} />
      {isFamily ? (
        <FamilyDeleteDialog
          familyId={entry.id}
          familyName={entry.first_name}
          onDeleted={onRefresh}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      ) : (
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
  const filters = useTableFilters({ initialChips: { type: "all" } });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);


  const fetchDirectory = useCallback(async () => {
    setLoading(true);

    // Fetch attendees, profiles, team members, AND families+children in parallel
    const [attendeesRes, profilesRes, teamMembersRes, familiesRes, childrenRes, staffRolesRes, followUpsRes] = await Promise.all([
      supabase.from("attendees").select("id, first_name, last_name, email, phone, is_member, tags, date_of_birth, sms_opt_in, first_visit_date").order("last_name"),
      supabase.from("profiles").select("attendee_id, user_id, full_name, email, is_staff, staff_role_id, staff_title, sms_opt_in"),
      supabase.from("team_members").select("user_id, teams:teams(name)"),
      supabase.from("families").select("id, family_name, parent1_name, parent1_phone"),
      supabase.from("children").select("id, first_name, last_name, family_id, date_of_birth"),
      supabase.from("staff_roles" as any).select("id, name"),
      supabase.from("follow_ups").select("attendee_id, prospect_pipeline_stage, updated_at").eq("type", "outreach").not("prospect_pipeline_stage", "is", null).order("updated_at", { ascending: false }),
    ]);

    const attendees = attendeesRes.data || [];
    const profiles = (profilesRes.data || []) as any[];
    const teamMembers = teamMembersRes.data || [];
    const families = familiesRes.data || [];
    const children = childrenRes.data || [];
    const staffRoleMap = new Map<string, string>(((staffRolesRes.data as any[]) || []).map((r) => [r.id, r.name]));

    // Latest pipeline stage per attendee (rows already ordered desc by updated_at)
    const pipelineByAttendee = new Map<string, PipelineStage>();
    ((followUpsRes.data as any[]) || []).forEach((fu) => {
      if (fu.attendee_id && !pipelineByAttendee.has(fu.attendee_id)) {
        pipelineByAttendee.set(fu.attendee_id, fu.prospect_pipeline_stage as PipelineStage);
      }
    });

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
    const result: DirectoryEntry[] = attendees.map((a: any) => {
      const profile = profilesByAttendeeId.get(a.id);
      return {
        ...a,
        isVolunteer: !!profile,
        isVolunteerOnly: false,
        teamNames: profile ? (userTeamMap.get(profile.user_id) || []) : [],
        source: "attendee" as const,
        isStaff: !!profile?.is_staff,
        staffTitle: profile?.staff_title || (profile?.staff_role_id ? staffRoleMap.get(profile.staff_role_id) : null) || null,
        smsOptIn: !!(a.sms_opt_in || profile?.sms_opt_in),
        pipelineStage: pipelineByAttendee.get(a.id) || null,
        hasFirstVisit: !!a.first_visit_date,
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
        isStaff: !!p.is_staff,
        staffTitle: p.staff_title || (p.staff_role_id ? staffRoleMap.get(p.staff_role_id) : null) || null,
        smsOptIn: !!p.sms_opt_in,
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

  const typeChip = filters.chips.type || "all";
  const selectedTeams = filters.facets.teams || [];
  const selectedSmsOpt = filters.facets.sms || [];

  const teamOptions: FacetSection["options"] = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.teamNames.forEach((t) => set.add(t)));
    return Array.from(set).sort().map((t) => ({ value: t, label: t }));
  }, [entries]);

  const filtered = entries.filter((e) => {
    const q = filters.search.toLowerCase();
    if (q) {
      const fields = [e.first_name, e.last_name, e.email, e.phone, ...e.teamNames];
      const hit = fields.some((f) => f?.toLowerCase().includes(q))
        || e.familyChildren?.some((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (typeChip === "members" && !e.is_member) return false;
    if (typeChip === "visitors" && !(e.pipelineStage === "visited" || (e.hasFirstVisit && !e.pipelineStage && !e.is_member && !e.isVolunteer && !e.isStaff))) return false;
    if (typeChip === "interested" && e.pipelineStage !== "interested") return false;
    if (typeChip === "invited" && e.pipelineStage !== "invited") return false;
    if (typeChip === "volunteers" && !e.isVolunteer) return false;
    if (typeChip === "staff" && !e.isStaff) return false;
    if (selectedTeams.length > 0 && !e.teamNames.some((t) => selectedTeams.includes(t))) return false;
    if (selectedSmsOpt.length > 0 && e.source !== "family") {
      const wantIn = selectedSmsOpt.includes("yes");
      const wantOut = selectedSmsOpt.includes("no");
      if (wantIn && !wantOut && !e.smsOptIn) return false;
      if (wantOut && !wantIn && e.smsOptIn) return false;
    }
    return true;
  });

  const formatBirthday = (dob: string | null) => {
    if (!dob) return "—";
    try { return format(parseISO(dob), "MMM d"); } catch { return "—"; }
  };

  const popoverSections: FacetSection[] = [
    { key: "teams", label: "Team", options: teamOptions },
    { key: "sms", label: "SMS opt-in", options: [{ value: "yes", label: "Opted in" }, { value: "no", label: "Not opted in" }] },
    { key: "hasEmail", label: "Has email", options: [{ value: "yes", label: "Has email" }, { value: "no", label: "No email" }] },
    { key: "hasPhone", label: "Has phone", options: [{ value: "yes", label: "Has phone" }, { value: "no", label: "No phone" }] },
  ];

  // Bulk selection (individuals only — families are skipped)
  const selectableFiltered = useMemo(() => filtered.filter((e) => e.source !== "family"), [filtered]);
  const allSelectableSelected = selectableFiltered.length > 0 && selectableFiltered.every((e) => selectedIds.has(e.id));
  const someSelectableSelected = selectableFiltered.some((e) => selectedIds.has(e.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (allSelectableSelected) {
        const next = new Set(prev);
        selectableFiltered.forEach((e) => next.delete(e.id));
        return next;
      }
      const next = new Set(prev);
      selectableFiltered.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const targets = entries
      .filter((e) => selectedIds.has(e.id) && e.source !== "family")
      .map((e) => ({ id: e.id, source: "attendee" as const, isVolunteerOnly: e.isVolunteerOnly }));
    if (targets.length === 0) return;
    setBulkDeleting(true);
    const { succeeded, failed } = await bulkDeleteDirectoryEntries(targets);
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setBulkConfirmText("");
    clearSelection();
    if (failed.length === 0) {
      toast.success(`Removed ${succeeded.length} ${succeeded.length === 1 ? "person" : "people"}`);
    } else {
      toast.error(`Removed ${succeeded.length}, ${failed.length} failed`);
    }
    fetchDirectory();
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
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, or team..."
                value={filters.search}
                onChange={(e) => filters.setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <FilterPopover
              sections={popoverSections}
              facets={filters.facets}
              onToggle={filters.toggleFacet}
              activeCount={filters.activeCount}
              onClearAll={filters.clearAll}
            />
          </div>
          <FilterChips
            options={[
              { value: "all", label: "All" },
              { value: "members", label: "Members" },
              { value: "visitors", label: "Visitors" },
              { value: "interested", label: "Interested" },
              { value: "invited", label: "Invited" },
              { value: "volunteers", label: "Volunteers" },
              { value: "staff", label: "Staff" },
            ]}
            value={typeChip}
            onChange={(v) => filters.setChip("type", v)}
          />
          <ActiveFilterBar
            total={entries.length}
            shown={filtered.length}
            activeCount={filters.activeCount}
            onClearAll={filters.clearAll}
          />
          {isAdmin && selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <div className="text-sm font-medium">{selectedIds.size} selected</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
                <Button size="sm" variant="destructive" onClick={() => { setBulkConfirmText(""); setBulkDeleteOpen(true); }}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete selected
                </Button>
              </div>
            </div>
          )}
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
                  {isAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelectableSelected ? true : someSelectableSelected ? "indeterminate" : false}
                        onCheckedChange={() => toggleAll()}
                        aria-label="Select all"
                        disabled={selectableFiltered.length === 0}
                      />
                    </TableHead>
                  )}
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Birthday</TableHead>
                  <TableHead>Team(s)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SMS</TableHead>
                  {isAdmin && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 7} className="text-center text-muted-foreground py-8">
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
                      {isAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {entry.source === "family" ? null : (
                            <Checkbox
                              checked={selectedIds.has(entry.id)}
                              onCheckedChange={() => toggleOne(entry.id)}
                              aria-label={`Select ${entry.first_name} ${entry.last_name}`}
                            />
                          )}
                        </TableCell>
                      )}
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
                      <TableCell>{formatPhoneDisplay(entry.phone, "—")}</TableCell>
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
                              {entry.isStaff && (
                                <Badge className="bg-primary/10 text-primary border-primary/30" variant="outline">
                                  {entry.staffTitle ? `Staff · ${entry.staffTitle}` : "Staff"}
                                </Badge>
                              )}
                              {entry.is_member && <Badge variant="default">Member</Badge>}
                              {entry.isVolunteer && <Badge variant="secondary">Volunteer</Badge>}
                              {!entry.is_member && !entry.isVolunteer && !entry.isStaff && (() => {
                                const stage = entry.pipelineStage;
                                if (stage === "interested") return <Badge variant="outline" className="border-purple-500/40 text-purple-700 dark:text-purple-300 bg-purple-500/10">Interested</Badge>;
                                if (stage === "invited") return <Badge variant="outline" className="border-blue-500/40 text-blue-700 dark:text-blue-300 bg-blue-500/10">Invited</Badge>;
                                if (stage === "connected") return <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-300 bg-green-500/10">Connected</Badge>;
                                if (stage === "visited") return <Badge variant="outline">Visitor</Badge>;
                                if (entry.hasFirstVisit) return <Badge variant="outline">Visitor</Badge>;
                                return <Badge variant="outline" className="text-muted-foreground">Contact</Badge>;
                              })()}
                              {entry.tags?.includes("first-timer") && (
                                <Badge variant="outline" className="text-warning border-warning">First Timer</Badge>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.source === "family" ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : entry.smsOptIn ? (
                          <Badge variant="outline" className="text-success border-success/40 bg-success/10 text-xs">Opted in</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">Not opted in</Badge>
                        )}
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

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Network, GripVertical, Pencil, UserCircle2, Search } from "lucide-react";
import { toast } from "sonner";

type ProfileRow = {
  user_id: string;
  full_name: string;
  email: string;
  is_staff: boolean;
  staff_role_id: string | null;
  staff_title: string | null;
  reports_to_user_id: string | null;
  org_team_id: string | null;
};

type Team = { id: string; name: string; team_type: string };
type StaffRole = { id: string; name: string };

const UNASSIGNED = "__unassigned__";

export default function Organogram() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProfileRow | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["org-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, is_staff, staff_role_id, staff_title, reports_to_user_id, org_team_id")
        .order("full_name");
      if (error) throw error;
      return (data || []) as unknown as ProfileRow[];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["org-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name, team_type").order("name");
      if (error) throw error;
      return (data || []) as Team[];
    },
  });

  const { data: staffRoles = [] } = useQuery({
    queryKey: ["staff-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_roles" as any)
        .select("id, name")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as StaffRole[];
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ user_id, patch }: { user_id: string; patch: Partial<ProfileRow> }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group profiles by department (org_team_id)
  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = search
      ? profiles.filter((p) => p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))
      : profiles;

    const byTeam = new Map<string, ProfileRow[]>();
    byTeam.set(UNASSIGNED, []);
    teams.forEach((t) => byTeam.set(t.id, []));
    filtered.forEach((p) => {
      const key = p.org_team_id || UNASSIGNED;
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key)!.push(p);
    });
    return byTeam;
  }, [profiles, teams, search]);

  const handleDragEnd = (e: DragEndEvent) => {
    const userId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    if (overId.startsWith("team:")) {
      const teamId = overId.slice(5);
      const newTeam = teamId === UNASSIGNED ? null : teamId;
      updateProfile.mutate({ user_id: userId, patch: { org_team_id: newTeam, reports_to_user_id: null } });
      toast.success("Moved to department");
    } else if (overId.startsWith("person:")) {
      const supervisor = overId.slice(7);
      if (supervisor === userId) return;
      const sup = profiles.find((p) => p.user_id === supervisor);
      updateProfile.mutate({
        user_id: userId,
        patch: { reports_to_user_id: supervisor, org_team_id: sup?.org_team_id ?? null },
      });
      toast.success("Reports-to updated");
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const buildTree = (deptId: string | null): ProfileRow[] => {
    const list = grouped.get(deptId || UNASSIGNED) || [];
    return list.filter((p) => !p.reports_to_user_id || !list.some((x) => x.user_id === p.reports_to_user_id));
  };

  const childrenOf = (parentId: string, deptId: string | null): ProfileRow[] => {
    const list = grouped.get(deptId || UNASSIGNED) || [];
    return list.filter((p) => p.reports_to_user_id === parentId);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" /> Organogram
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search people…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Drag a person onto a department box to move them, or onto another person to set them as their supervisor.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-12">Loading…</p>
          ) : (
            <div className="space-y-6">
              {[...teams, { id: UNASSIGNED, name: "Unassigned", team_type: "" } as Team].map((team) => {
                const roots = buildTree(team.id === UNASSIGNED ? null : team.id);
                return (
                  <DepartmentBox
                    key={team.id}
                    team={team}
                    roots={roots}
                    childrenOf={(pid) => childrenOf(pid, team.id === UNASSIGNED ? null : team.id)}
                    onEdit={setEditing}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PersonEditDialog
        person={editing}
        teams={teams}
        staffRoles={staffRoles}
        profiles={profiles}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return;
          updateProfile.mutate(
            { user_id: editing.user_id, patch },
            {
              onSuccess: () => {
                toast.success("Updated");
                setEditing(null);
              },
            }
          );
        }}
      />
    </DndContext>
  );
}

function DepartmentBox({
  team,
  roots,
  childrenOf,
  onEdit,
}: {
  team: Team;
  roots: ProfileRow[];
  childrenOf: (parentId: string) => ProfileRow[];
  onEdit: (p: ProfileRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `team:${team.id}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 p-4 transition ${
        isOver ? "border-primary bg-primary/5" : "border-dashed border-muted-foreground/30"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-lg">{team.name}</h3>
          {team.team_type && (
            <Badge variant="outline" className="text-xs capitalize">{team.team_type}</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{roots.length} top-level</span>
      </div>
      {roots.length === 0 ? (
        <p className="text-sm text-muted-foreground italic px-2 py-4">Drop people here</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {roots.map((p) => (
            <PersonNode key={p.user_id} person={p} childrenOf={childrenOf} depth={0} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonNode({
  person,
  childrenOf,
  depth,
  onEdit,
}: {
  person: ProfileRow;
  childrenOf: (parentId: string) => ProfileRow[];
  depth: number;
  onEdit: (p: ProfileRow) => void;
}) {
  const kids = childrenOf(person.user_id);
  return (
    <div className="flex flex-col items-start gap-2">
      <PersonCard person={person} onEdit={onEdit} />
      {kids.length > 0 && (
        <div className="ml-4 pl-4 border-l-2 border-muted flex flex-col gap-2">
          {kids.map((k) => (
            <PersonNode key={k.user_id} person={k} childrenOf={childrenOf} depth={depth + 1} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({ person, onEdit }: { person: ProfileRow; onEdit: (p: ProfileRow) => void }) {
  const drag = useDraggable({ id: person.user_id });
  const drop = useDroppable({ id: `person:${person.user_id}` });
  const style = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      style={style}
      className={`rounded-md border bg-card px-3 py-2 shadow-sm min-w-[200px] flex items-center gap-2 transition ${
        drop.isOver ? "ring-2 ring-primary" : ""
      } ${drag.isDragging ? "opacity-50" : ""}`}
    >
      <button {...drag.listeners} {...drag.attributes} className="cursor-grab text-muted-foreground touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <UserCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{person.full_name || person.email}</p>
        {(person.is_staff || person.staff_title) && (
          <p className="text-xs text-muted-foreground truncate">
            {person.staff_title || "Staff"}
          </p>
        )}
      </div>
      {person.is_staff && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Staff</Badge>}
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(person)}>
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

function PersonEditDialog({
  person,
  teams,
  staffRoles,
  profiles,
  onClose,
  onSave,
}: {
  person: ProfileRow | null;
  teams: Team[];
  staffRoles: StaffRole[];
  profiles: ProfileRow[];
  onClose: () => void;
  onSave: (patch: Partial<ProfileRow>) => void;
}) {
  const [isStaff, setIsStaff] = useState(false);
  const [roleId, setRoleId] = useState<string>("");
  const [customTitle, setCustomTitle] = useState("");
  const [reportsTo, setReportsTo] = useState<string>("");
  const [orgTeam, setOrgTeam] = useState<string>("");

  // Re-init when person changes
  useMemo(() => {
    if (person) {
      setIsStaff(person.is_staff);
      setRoleId(person.staff_role_id || "");
      setCustomTitle(person.staff_title || "");
      setReportsTo(person.reports_to_user_id || "");
      setOrgTeam(person.org_team_id || "");
    }
  }, [person?.user_id]);

  if (!person) return null;

  const submit = () => {
    onSave({
      is_staff: isStaff,
      staff_role_id: roleId || null,
      staff_title: customTitle.trim() || null,
      reports_to_user_id: reportsTo || null,
      org_team_id: orgTeam || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Org Position — {person.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="is-staff" className="cursor-pointer">Mark as Staff</Label>
            <Switch id="is-staff" checked={isStaff} onCheckedChange={setIsStaff} />
          </div>

          <div className="space-y-1">
            <Label>Staff Role (predefined)</Label>
            <Select value={roleId || "__none__"} onValueChange={(v) => setRoleId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {staffRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Custom Title (overrides role)</Label>
            <Input
              placeholder="e.g. Worship Director"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Department / Team</Label>
            <Select value={orgTeam || UNASSIGNED} onValueChange={(v) => setOrgTeam(v === UNASSIGNED ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reports To</Label>
            <Select value={reportsTo || "__none__"} onValueChange={(v) => setReportsTo(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="No supervisor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No supervisor</SelectItem>
                {profiles
                  .filter((p) => p.user_id !== person.user_id)
                  .map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

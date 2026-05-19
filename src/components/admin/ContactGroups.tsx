import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Users, RefreshCw } from "lucide-react";
import RecipientPicker, { type Recipient } from "@/components/comms/RecipientPicker";

type GroupKind = "static" | "smart";

interface Group {
  id: string;
  name: string;
  description: string | null;
  kind: GroupKind;
  filter: Record<string, unknown>;
  created_at: string;
}

interface SmartFilter {
  tagsAny?: string[];
  tagsAll?: string[];
  requireSmsOptIn?: boolean;
  requirePhone?: boolean;
  requireEmail?: boolean;
  isMember?: boolean;
  isStaff?: boolean;
  excludeDoNotContact?: boolean;
}

export default function ContactGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);

  // form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<GroupKind>("static");
  const [staticMembers, setStaticMembers] = useState<Recipient[]>([]);
  const [filter, setFilter] = useState<SmartFilter>({ excludeDoNotContact: true });
  const [tagsAnyText, setTagsAnyText] = useState("");
  const [tagsAllText, setTagsAllText] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contact_groups")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setGroups((data as Group[]) ?? []);
    setLoading(false);
    // compute counts
    const map: Record<string, number> = {};
    await Promise.all(
      (data ?? []).map(async (g: Group) => {
        const { data: rs } = await supabase.rpc("resolve_contact_group", { _group_id: g.id });
        map[g.id] = (rs as unknown[])?.length ?? 0;
      })
    );
    setCounts(map);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setKind("static");
    setStaticMembers([]);
    setFilter({ excludeDoNotContact: true });
    setTagsAnyText("");
    setTagsAllText("");
    setPreviewCount(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = async (g: Group) => {
    resetForm();
    setEditing(g);
    setName(g.name);
    setDescription(g.description ?? "");
    setKind(g.kind);
    if (g.kind === "smart") {
      const f = (g.filter ?? {}) as SmartFilter;
      setFilter(f);
      setTagsAnyText((f.tagsAny ?? []).join(", "));
      setTagsAllText((f.tagsAll ?? []).join(", "));
    } else {
      // load members
      const { data: mems } = await supabase
        .from("contact_group_members")
        .select("member_type, member_id")
        .eq("group_id", g.id);
      const attIds = (mems ?? []).filter((m: any) => m.member_type === "attendee").map((m: any) => m.member_id);
      const profIds = (mems ?? []).filter((m: any) => m.member_type === "profile").map((m: any) => m.member_id);
      const [att, prof] = await Promise.all([
        attIds.length
          ? supabase.from("attendees").select("id, first_name, last_name, email, phone, sms_opt_in, do_not_contact, tags").in("id", attIds)
          : Promise.resolve({ data: [] as any[] }),
        profIds.length
          ? supabase.from("profiles").select("id, full_name, email, phone, sms_opt_in, do_not_contact").in("id", profIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const a: Recipient[] = (att.data ?? []).map((r: any) => ({
        key: `attendee:${r.id}`,
        source: "attendee",
        id: r.id,
        firstName: r.first_name ?? "",
        lastName: r.last_name ?? "",
        email: r.email,
        phone: r.phone,
        smsOptIn: !!r.sms_opt_in,
        doNotContact: !!r.do_not_contact,
        tags: r.tags ?? [],
      }));
      const p: Recipient[] = (prof.data ?? []).map((r: any) => {
        const parts = String(r.full_name ?? "").trim().split(/\s+/);
        return {
          key: `profile:${r.id}`,
          source: "profile",
          id: r.id,
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" "),
          email: r.email,
          phone: r.phone,
          smsOptIn: !!r.sms_opt_in,
          doNotContact: !!r.do_not_contact,
          tags: [],
        };
      });
      setStaticMembers([...a, ...p]);
    }
    setOpen(true);
  };

  const buildSmartFilter = (): SmartFilter => ({
    ...filter,
    tagsAny: tagsAnyText.split(",").map((t) => t.trim()).filter(Boolean),
    tagsAll: tagsAllText.split(",").map((t) => t.trim()).filter(Boolean),
  });

  const previewSmart = async () => {
    // Temporarily insert + resolve? Use direct query instead.
    const f = buildSmartFilter();
    let q = supabase.from("attendees").select("id", { count: "exact", head: true });
    if (f.excludeDoNotContact) q = q.eq("do_not_contact", false);
    if (f.requireSmsOptIn) q = q.eq("sms_opt_in", true);
    if (f.requirePhone) q = q.not("phone", "is", null);
    if (f.requireEmail) q = q.not("email", "is", null);
    if (f.isMember) q = q.eq("is_member", true);
    if (f.tagsAll && f.tagsAll.length) q = q.contains("tags", f.tagsAll);
    if (f.tagsAny && f.tagsAny.length) q = q.overlaps("tags", f.tagsAny);
    const { count } = await q;
    setPreviewCount(count ?? 0);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    const payload: any = {
      name: name.trim(),
      description: description.trim() || null,
      kind,
      filter: kind === "smart" ? buildSmartFilter() : {},
      created_by: editing?.created_at ? undefined : user?.id,
    };
    let groupId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("contact_groups").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("contact_groups").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      groupId = data!.id;
    }
    if (kind === "static" && groupId) {
      // replace memberships
      await supabase.from("contact_group_members").delete().eq("group_id", groupId);
      if (staticMembers.length) {
        const rows = staticMembers.map((r) => ({
          group_id: groupId,
          member_type: r.source,
          member_id: r.id,
        }));
        const { error } = await supabase.from("contact_group_members").insert(rows);
        if (error) return toast.error(error.message);
      }
    }
    toast.success(editing ? "Group updated" : "Group created");
    setOpen(false);
    resetForm();
    load();
  };

  const remove = async (g: Group) => {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    const { error } = await supabase.from("contact_groups").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success("Group deleted");
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Contact Groups
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> New group
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No groups yet. Create one to send Email or SMS to a list of people.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {g.kind}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {counts[g.id] ?? "…"} contacts
                    </Badge>
                  </div>
                  {g.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(g)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(g)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit group" : "Create group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as GroupKind)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={!!editing}
                >
                  <option value="static">Static list</option>
                  <option value="smart">Smart (rules)</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>

            {kind === "static" ? (
              <div>
                <Label>Members</Label>
                <RecipientPicker channel="email" value={staticMembers} onChange={setStaticMembers} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={!!filter.requireSmsOptIn}
                      onCheckedChange={(v) => setFilter({ ...filter, requireSmsOptIn: !!v })}
                    />
                    SMS opt-in only
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={!!filter.requirePhone}
                      onCheckedChange={(v) => setFilter({ ...filter, requirePhone: !!v })}
                    />
                    Has phone
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={!!filter.requireEmail}
                      onCheckedChange={(v) => setFilter({ ...filter, requireEmail: !!v })}
                    />
                    Has email
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={!!filter.isMember}
                      onCheckedChange={(v) => setFilter({ ...filter, isMember: !!v })}
                    />
                    Members only (attendees)
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={!!filter.isStaff}
                      onCheckedChange={(v) => setFilter({ ...filter, isStaff: !!v })}
                    />
                    Staff only (profiles)
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={filter.excludeDoNotContact !== false}
                      onCheckedChange={(v) => setFilter({ ...filter, excludeDoNotContact: !!v })}
                    />
                    Exclude do-not-contact
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tags — any of (comma separated)</Label>
                    <Input
                      placeholder="visitor, interest-2026-06-01"
                      value={tagsAnyText}
                      onChange={(e) => setTagsAnyText(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Tags — all of</Label>
                    <Input
                      placeholder="contacted, baptism-interest"
                      value={tagsAllText}
                      onChange={(e) => setTagsAllText(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={previewSmart}>
                    Preview match count
                  </Button>
                  {previewCount !== null && (
                    <span className="text-sm text-muted-foreground">
                      Matches ~{previewCount} attendees (profiles also included)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

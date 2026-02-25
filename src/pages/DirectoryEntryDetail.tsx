import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO, differenceInYears } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Save, Loader2, User, Phone, Mail, MapPin, Calendar, Heart, Users, Plus, X, Cake, Tag,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────
interface AttendeeData {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  date_of_birth: string | null;
  address: string | null;
  notes: string | null;
  prayer_requests: string | null;
  how_heard: string | null;
  first_visit_date: string | null;
  tags: string[] | null;
}

interface Relationship {
  id: string;
  from_attendee_id: string;
  to_attendee_id: string;
  relationship_type: string;
  related_name: string;
}

interface AttendanceRecord {
  id: string;
  visit_date: string;
  notes: string | null;
}

const RELATIONSHIP_TYPES = ["spouse", "parent", "child", "sibling"] as const;
const INVERSE: Record<string, string> = { parent: "child", child: "parent", spouse: "spouse", sibling: "sibling" };

// ─── Main Page ───────────────────────────────────────────
export default function DirectoryEntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [entry, setEntry] = useState<AttendeeData | null>(null);
  const [form, setForm] = useState<AttendeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  const fetchEntry = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [attendeeRes, profileRes] = await Promise.all([
      supabase.from("attendees").select("*").eq("id", id).maybeSingle(),
      supabase.from("profiles").select("user_id").eq("attendee_id", id).maybeSingle(),
    ]);

    if (!attendeeRes.data) {
      setLoading(false);
      return;
    }
    setEntry(attendeeRes.data);
    setForm(attendeeRes.data);

    // Fetch teams, relationships, attendance in parallel
    const teamPromise = profileRes.data
      ? supabase.from("team_members").select("teams:teams(name)").eq("user_id", profileRes.data.user_id)
      : Promise.resolve({ data: [] });

    const [teamRes, relFromRes, relToRes, attendanceRes] = await Promise.all([
      teamPromise,
      supabase.from("attendee_relationships").select("id, from_attendee_id, to_attendee_id, relationship_type").eq("from_attendee_id", id),
      supabase.from("attendee_relationships").select("id, from_attendee_id, to_attendee_id, relationship_type").eq("to_attendee_id", id),
      supabase.from("attendance_records").select("id, visit_date, notes").eq("attendee_id", id).order("visit_date", { ascending: false }).limit(20),
    ]);

    // Teams
    const names = (teamRes.data || []).map((tm: any) => tm.teams?.name).filter(Boolean);
    setTeamNames(names);

    // Attendance
    setAttendance(attendanceRes.data || []);

    // Relationships
    const allRels = [...(relFromRes.data || []), ...(relToRes.data || [])];
    const otherIds = allRels.map((r) => r.from_attendee_id === id ? r.to_attendee_id : r.from_attendee_id);
    if (otherIds.length > 0) {
      const { data: attendees } = await supabase.from("attendees").select("id, first_name, last_name").in("id", otherIds);
      const nameMap = new Map((attendees || []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));
      setRelationships(allRels.map((r) => {
        const otherId = r.from_attendee_id === id ? r.to_attendee_id : r.from_attendee_id;
        const displayType = r.from_attendee_id === id ? r.relationship_type : INVERSE[r.relationship_type] || r.relationship_type;
        return { ...r, related_name: nameMap.get(otherId) || "Unknown", relationship_type: displayType };
      }));
    } else {
      setRelationships([]);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchEntry(); }, [fetchEntry]);

  const handleSave = async () => {
    if (!form || !id) return;
    setSaving(true);
    const { error } = await supabase.from("attendees").update({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || null,
      phone: form.phone || null,
      date_of_birth: form.date_of_birth || null,
      address: form.address || null,
      is_member: form.is_member,
      notes: form.notes || null,
      prayer_requests: form.prayer_requests || null,
      how_heard: form.how_heard || null,
      tags: form.tags,
    }).eq("id", id);

    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Entry updated");
      setEntry(form);
      setEditing(false);
    }
    setSaving(false);
  };

  const update = (field: keyof AttendeeData, value: any) =>
    setForm((f) => f ? { ...f, [field]: value } : f);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry || !form) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Directory
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Entry not found.</CardContent>
        </Card>
      </div>
    );
  }

  const age = entry.date_of_birth
    ? differenceInYears(new Date(), parseISO(entry.date_of_birth))
    : null;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Directory
        </Button>
        {isAdmin && !editing && (
          <Button onClick={() => setEditing(true)}>Edit Entry</Button>
        )}
        {isAdmin && editing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setForm(entry); setEditing(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-7 w-7" />
            </div>
            <div className="flex-1">
              {editing ? (
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
              ) : (
                <>
                  <CardTitle className="text-xl">{entry.first_name} {entry.last_name}</CardTitle>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {entry.is_member && <Badge variant="default">Member</Badge>}
                    {teamNames.length > 0 && <Badge variant="secondary">Volunteer</Badge>}
                    {!entry.is_member && teamNames.length === 0 && <Badge variant="outline">Visitor</Badge>}
                    {entry.tags?.includes("first-timer") && (
                      <Badge variant="outline" className="text-warning border-warning">First Timer</Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Contact Information</h3>
            {editing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                  <Input type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
                  <Input type="tel" value={form.phone || ""} onChange={(e) => update("phone", e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</Label>
                  <Input value={form.address || ""} onChange={(e) => update("address", e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow icon={Mail} label="Email" value={entry.email} />
                <InfoRow icon={Phone} label="Phone" value={entry.phone} />
                <InfoRow icon={MapPin} label="Address" value={entry.address} className="sm:col-span-2" />
              </div>
            )}
          </div>

          <Separator />

          {/* Personal Details */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Personal Details</h3>
            {editing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1"><Cake className="h-3 w-3" /> Date of Birth</Label>
                  <Input type="date" value={form.date_of_birth || ""} onChange={(e) => update("date_of_birth", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>How They Heard About Us</Label>
                  <Input value={form.how_heard || ""} onChange={(e) => update("how_heard", e.target.value)} />
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Switch checked={form.is_member} onCheckedChange={(v) => update("is_member", v)} />
                  <Label>Member</Label>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow icon={Cake} label="Birthday" value={entry.date_of_birth ? `${format(parseISO(entry.date_of_birth), "MMMM d, yyyy")}${age !== null ? ` (age ${age})` : ""}` : null} />
                <InfoRow icon={Calendar} label="First Visit" value={entry.first_visit_date ? format(parseISO(entry.first_visit_date), "MMM d, yyyy") : null} />
                <InfoRow icon={Tag} label="How Heard" value={entry.how_heard} />
              </div>
            )}
          </div>

          {/* Teams */}
          {teamNames.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Teams</h3>
                <div className="flex gap-2 flex-wrap">
                  {teamNames.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
              </div>
            </>
          )}

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && !editing && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Tags</h3>
                <div className="flex gap-2 flex-wrap">
                  {entry.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              </div>
            </>
          )}

          {/* Notes & Prayer Requests */}
          <Separator />
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Notes & Prayer Requests</h3>
            {editing ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={3} value={form.notes || ""} onChange={(e) => update("notes", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Prayer Requests</Label>
                  <Textarea rows={3} value={form.prayer_requests || ""} onChange={(e) => update("prayer_requests", e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium">Notes:</span>
                  <p className="text-sm text-muted-foreground mt-0.5">{entry.notes || "—"}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Prayer Requests:</span>
                  <p className="text-sm text-muted-foreground mt-0.5">{entry.prayer_requests || "—"}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Relationships */}
      <RelationshipsCard attendeeId={id!} relationships={relationships} onRefresh={fetchEntry} />

      {/* Attendance History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-4 w-4" /> Attendance History
          </CardTitle>
          <CardDescription>Recent visits</CardDescription>
        </CardHeader>
        <CardContent>
          {attendance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No attendance records</p>
          ) : (
            <div className="space-y-2">
              {attendance.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm font-medium">{format(parseISO(a.visit_date), "MMM d, yyyy")}</span>
                  {a.notes && <span className="text-xs text-muted-foreground">{a.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function InfoRow({ icon: Icon, label, value, className }: { icon: any; label: string; value: string | null; className?: string }) {
  return (
    <div className={`flex items-start gap-2 ${className || ""}`}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value || "—"}</p>
      </div>
    </div>
  );
}

function RelationshipsCard({ attendeeId, relationships, onRefresh }: { attendeeId: string; relationships: Relationship[]; onRefresh: () => void }) {
  const { isAdmin } = useAuth();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [relType, setRelType] = useState<string>("spouse");

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("attendees").select("id, first_name, last_name")
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
        .neq("id", attendeeId).limit(10);
      setResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, attendeeId]);

  const addRelationship = async () => {
    if (!selectedId) return;
    const { error } = await supabase.from("attendee_relationships").insert({
      from_attendee_id: attendeeId, to_attendee_id: selectedId, relationship_type: relType,
    });
    if (error) toast.error(error.message);
    else { toast.success("Relationship added"); setAdding(false); setSearch(""); setSelectedId(""); onRefresh(); }
  };

  const removeRelationship = async (relId: string) => {
    const { error } = await supabase.from("attendee_relationships").delete().eq("id", relId);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); onRefresh(); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Heart className="h-4 w-4" /> Relationships
        </CardTitle>
        <CardDescription>Family connections</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {relationships.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-4">No relationships yet</p>
        )}
        {relationships.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize text-xs">{r.relationship_type}</Badge>
              <span className="text-sm font-medium">{r.related_name}</span>
            </div>
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRelationship(r.id)}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}

        {isAdmin && adding && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label>Search person</Label>
              <Input placeholder="Type a name..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {results.length > 0 && (
                <div className="max-h-32 overflow-auto rounded border mt-1">
                  {results.map((a) => (
                    <button
                      key={a.id}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent ${selectedId === a.id ? "bg-accent font-medium" : ""}`}
                      onClick={() => { setSelectedId(a.id); setSearch(`${a.first_name} ${a.last_name}`); setResults([]); }}
                    >
                      {a.first_name} {a.last_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Relationship</Label>
              <Select value={relType} onValueChange={setRelType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addRelationship} disabled={!selectedId}>Add</Button>
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setSearch(""); setSelectedId(""); }}>Cancel</Button>
            </div>
          </div>
        )}

        {isAdmin && !adding && (
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Add Relationship
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

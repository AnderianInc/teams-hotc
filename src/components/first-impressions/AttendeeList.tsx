import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { UserPlus, Search, Phone, Mail, MapPin } from "lucide-react";
import { FilterChips } from "@/components/filters/FilterChips";

type DerivedStatus = "interested" | "invited" | "visitor" | "connected" | "member";

export default function AttendeeList() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", address: "", notes: "", tags: "",
    smsOptIn: false,
  });

  const update = (f: string, v: string | boolean) => setForm((p) => ({ ...p, [f]: v }));

  const { data: attendees, isLoading } = useQuery({
    queryKey: ["attendees", search],
    queryFn: async () => {
      let q = supabase.from("attendees").select("*").order("created_at", { ascending: false });
      if (search.length >= 2) {
        const term = `%${search}%`;
        q = q.or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
      }
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Pipeline stages keyed by attendee_id — source of truth for visitor status
  const { data: pipelineStages } = useQuery({
    queryKey: ["attendee-pipeline-stages"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("follow_ups")
        .select("attendee_id, prospect_pipeline_stage, updated_at")
        .eq("type", "outreach")
        .not("prospect_pipeline_stage", "is", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, string>();
      (data ?? []).forEach((r: any) => {
        if (r.attendee_id && !map.has(r.attendee_id)) map.set(r.attendee_id, r.prospect_pipeline_stage);
      });
      return map;
    },
  });

  const deriveStatus = (a: any): DerivedStatus => {
    if (a.is_member) return "member";
    const stage = pipelineStages?.get(a.id) as string | undefined;
    if (stage === "member") return "member";
    if (stage === "connected") return "connected";
    if (stage === "invited") return "invited";
    if (stage === "visited") return "visitor";
    if (stage === "interested") return "interested";
    // Fall back to tag-based detection (legacy)
    const stageTag = (a.tags || []).find((t: string) => t.startsWith("stage:"));
    const tagStage = stageTag ? stageTag.split(":")[1] : null;
    if (tagStage === "connected") return "connected";
    if (tagStage === "invited") return "invited";
    if (tagStage === "interested") return "interested";
    if (a.first_visit_date) return "visitor";
    return "interested";
  };

  const filteredAttendees = useMemo(() => {
    if (!attendees) return [];
    if (statusFilter === "all") return attendees;
    return attendees.filter((a) => deriveStatus(a) === statusFilter);
  }, [attendees, statusFilter, pipelineStages]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: attendees?.length ?? 0, interested: 0, invited: 0, visitor: 0, connected: 0, member: 0 };
    (attendees ?? []).forEach((a) => {
      const s = deriveStatus(a);
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [attendees, pipelineStages]);


  const addAttendee = useMutation({
    mutationFn: async () => {
      const tags = form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
      const today = new Date().toISOString().split("T")[0];
      const optInTs = form.smsOptIn && form.phone ? new Date().toISOString() : null;
      const { data, error } = await supabase.from("attendees").insert({
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
        tags,
        first_visit_date: today,
        is_member: false,
        sms_opt_in: !!optInTs,
        sms_opt_in_at: optInTs,
        sms_opt_in_source: optInTs ? "staff_entered" : null,
        sms_opt_in_text: optInTs
          ? "Verbal/written opt-in recorded by First Impressions team member."
          : null,
      } as any).select("id").single();
      if (error) throw error;

      // Auto-create an outreach follow-up + pipeline entry for new first-time visitors
      // (skip if one already exists to avoid duplicates)
      if (data?.id) {
        const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const { data: existing } = await (supabase.from as any)("follow_ups")
          .select("id, prospect_pipeline_stage")
          .eq("attendee_id", data.id)
          .eq("type", "outreach")
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();

        if (!existing) {
          await (supabase.from as any)("follow_ups").insert({
            attendee_id: data.id,
            type: "outreach",
            status: "pending",
            prospect_pipeline_stage: "visited",
            due_date: dueDate,
            notes: `Auto-created: first-time visitor on ${today}`,
          });
        } else if (!existing.prospect_pipeline_stage) {
          await (supabase.from as any)("follow_ups")
            .update({ prospect_pipeline_stage: "visited" })
            .eq("id", existing.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Visitor registered and added to outreach pipeline!");
      setAddOpen(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", address: "", notes: "", tags: "", smsOptIn: false });
      queryClient.invalidateQueries({ queryKey: ["attendees"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["recent-first-visitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search visitors..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                New Visitor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Register New Visitor</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addAttendee.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>First Name</Label>
                    <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Last Name</Label>
                    <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </div>
                {form.phone && (
                  <label className="flex items-start gap-2 cursor-pointer rounded-md border bg-muted/30 p-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={form.smsOptIn}
                      onChange={(e) => update("smsOptIn", e.target.checked)}
                    />
                    <span className="text-xs leading-snug">
                      Visitor gave verbal/written consent to receive recurring SMS from HOTC (events, follow-up,
                      announcements). Msg &amp; data rates may apply. Reply STOP to opt out.{" "}
                      <a href="/sms-policy" target="_blank" rel="noopener" className="text-primary underline">
                        Terms
                      </a>.
                    </span>
                  </label>
                )}
                <div className="space-y-1">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Tags (comma-separated)</Label>
                  <Input placeholder="e.g. new visitor, interested in groups" value={form.tags} onChange={(e) => update("tags", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={addAttendee.isPending}>
                  {addAttendee.isPending ? "Saving..." : "Register Visitor"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <FilterChips
          ariaLabel="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All", count: statusCounts.all },
            { value: "interested", label: "Interested", count: statusCounts.interested },
            { value: "invited", label: "Invited", count: statusCounts.invited },
            { value: "visitor", label: "Visitor", count: statusCounts.visitor },
            { value: "connected", label: "Connected", count: statusCounts.connected },
            { value: "member", label: "Member", count: statusCounts.member },
          ]}
        />

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>First Visit</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAttendees.map((a) => {
                const status = deriveStatus(a);
                return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.first_name} {a.last_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                      {a.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{a.phone}</span>}
                      {a.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{a.email}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.first_visit_date ? new Date(a.first_visit_date).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(a.tags || []).filter((t: string) => !t.startsWith("stage:")).map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {status === "member" && <Badge variant="default">Member</Badge>}
                    {status === "connected" && <Badge className="bg-success/15 text-success border-success/30" variant="outline">Connected</Badge>}
                    {status === "invited" && <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" variant="outline">Invited</Badge>}
                    {status === "visitor" && <Badge variant="outline">Visitor</Badge>}
                    {status === "interested" && <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30">Interested</Badge>}
                  </TableCell>
                </TableRow>
                );
              })}
              {filteredAttendees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No visitors match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

      </CardContent>
    </Card>
  );
}

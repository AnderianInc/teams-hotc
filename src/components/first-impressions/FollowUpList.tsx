import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, CheckCircle2, Clock, XCircle, MessageSquare, Mail, MoreHorizontal, AlertTriangle, Send, Download, Trash2 } from "lucide-react";
import { downloadCsv } from "@/lib/csvExport";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import EmailComposer from "@/components/admin/EmailComposer";
import { FollowUpActivityLog } from "./FollowUpActivityLog";

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  contacted: "bg-primary/10 text-primary border-primary/30",
  connected: "bg-success/10 text-success border-success/30",
  no_response: "bg-muted text-muted-foreground",
  closed: "bg-secondary text-secondary-foreground",
};

const statusIcons: Record<string, React.ElementType> = {
  pending: Clock,
  contacted: MessageSquare,
  connected: CheckCircle2,
  no_response: XCircle,
  closed: XCircle,
};

const priorityColors: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "",
  high: "text-warning",
  urgent: "text-destructive font-semibold",
};

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "connected" || status === "closed") return false;
  return new Date(dueDate) < new Date();
}

export default function FollowUpList() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState<{ email: string; name: string; attendeeId: string } | null>(null);
  const [smsTarget, setSmsTarget] = useState<{ phone: string; name: string; attendeeId: string; followUpId: string } | null>(null);
  const [smsBody, setSmsBody] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  const sendSms = async () => {
    if (!smsTarget || !smsBody.trim()) return;
    setSmsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          to: smsTarget.phone,
          body: smsBody.trim(),
          to_name: smsTarget.name,
          related_attendee_id: smsTarget.attendeeId,
          logged_by: user?.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Mark the follow-up as contacted
      await (supabase.from as any)("follow_ups").update({ status: "contacted" }).eq("id", smsTarget.followUpId);
      toast.success("Text sent!");
      setSmsTarget(null);
      setSmsBody("");
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to send text");
    } finally {
      setSmsSending(false);
    }
  };

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | "inreach" | "outreach">("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  // New follow-up form
  const [attendeeId, setAttendeeId] = useState("");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fuType, setFuType] = useState<"outreach" | "inreach">("outreach");
  const [priority, setPriority] = useState("normal");
  const [assignedTo, setAssignedTo] = useState("");

  const { data: followUps, isLoading } = useQuery({
    queryKey: ["follow-ups", typeFilter, assigneeFilter],
    queryFn: async () => {
      // profiles:assigned_to would fail because follow_ups.assigned_to FKs to auth.users,
      // not profiles; we resolve assignee names via the volunteers query instead
      let q = (supabase.from as any)("follow_ups")
        .select("*, attendees(first_name, last_name, email, phone)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (typeFilter !== "all") q = q.eq("type", typeFilter);
      if (assigneeFilter !== "all") q = q.eq("assigned_to", assigneeFilter);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: attendees } = useQuery({
    queryKey: ["attendees-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendees").select("id, first_name, last_name").order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: volunteers } = useQuery({
    queryKey: ["volunteers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const volunteerMap = new Map((volunteers ?? []).map((v: any) => [v.user_id, v.full_name]));

  const addFollowUp = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        attendee_id: attendeeId,
        method: method || null,
        notes: notes || null,
        due_date: dueDate || null,
        type: fuType,
        assigned_to: assignedTo || null,
      };
      // priority column requires the enhanced follow_ups migration; omit if default
      if (priority !== "normal") payload.priority = priority;
      const { error } = await (supabase.from as any)("follow_ups").insert(payload);
      if (error) throw error;

      // Notify the assignee
      if (assignedTo) {
        const person = attendees?.find((a) => a.id === attendeeId);
        const personName = person ? `${person.first_name} ${person.last_name}` : "someone";
        try {
          await supabase.functions.invoke("notify", {
            body: {
              recipient_id: assignedTo,
              type: "follow_up_assigned",
              title: `New ${fuType} follow-up assigned`,
              body: `You've been assigned to follow up with ${personName}${dueDate ? ` by ${new Date(dueDate).toLocaleDateString()}` : ""}.`,
              url: "/team/first-impressions",
              high_priority: priority === "urgent" || priority === "high",
            },
          });
        } catch (err) {
          console.error("Follow-up notification failed:", err);
        }
      }
    },
    onSuccess: () => {
      toast.success("Follow-up created!");
      setAddOpen(false);
      setAttendeeId(""); setMethod(""); setNotes(""); setDueDate("");
      setFuType("outreach"); setPriority("normal"); setAssignedTo("");
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "connected" || status === "closed") updates.completed_at = new Date().toISOString();
      const { error } = await (supabase.from as any)("follow_ups").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFollowUp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("follow_ups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["recent-first-visitors"] });
      toast.success("Follow-up deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailFollowUp = followUps?.find((fu: any) => fu.id === detailId);

  const overdueCount = followUps?.filter((fu: any) => isOverdue(fu.due_date, fu.status)).length ?? 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="font-display font-semibold">Follow-Up Queue</h3>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" /> {overdueCount} overdue
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = (followUps ?? []).map((fu: any) => ({
                  type: fu.type ?? "outreach",
                  status: fu.status,
                  priority: fu.priority ?? "normal",
                  contact: `${fu.attendees?.first_name ?? ""} ${fu.attendees?.last_name ?? ""}`.trim(),
                  email: fu.attendees?.email ?? "",
                  phone: fu.attendees?.phone ?? "",
                  assigned_to: volunteerMap.get(fu.assigned_to) ?? "",
                  due_date: fu.due_date ?? "",
                  notes: fu.notes ?? "",
                  created_at: fu.created_at?.split("T")[0] ?? "",
                }));
                downloadCsv("follow-ups.csv", rows);
              }}
              disabled={!followUps?.length}
            >
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" />New Follow-Up</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Follow-Up</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addFollowUp.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={fuType} onValueChange={(v) => setFuType(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outreach">Outreach</SelectItem>
                        <SelectItem value="inreach">Inreach</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Person</Label>
                  <Select value={attendeeId} onValueChange={setAttendeeId} required>
                    <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                    <SelectContent>
                      {attendees?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Assign To</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      {volunteers?.map((v: any) => (
                        <SelectItem key={v.user_id} value={v.user_id}>{v.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue placeholder="How to follow up" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Phone Call</SelectItem>
                      <SelectItem value="text">Text Message</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="visit">In-Person Visit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={addFollowUp.isPending}>
                  {addFollowUp.isPending ? "Creating..." : "Create Follow-Up"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-3 h-7">All</TabsTrigger>
              <TabsTrigger value="outreach" className="text-xs px-3 h-7">Outreach</TabsTrigger>
              <TabsTrigger value="inreach" className="text-xs px-3 h-7">Inreach</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All assignees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {volunteers?.map((v: any) => (
                <SelectItem key={v.user_id} value={v.user_id}>{v.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {followUps?.map((fu: any) => {
                const Icon = statusIcons[fu.status] || Clock;
                const overdue = isOverdue(fu.due_date, fu.status);
                return (
                  <TableRow
                    key={fu.id}
                    className={overdue ? "bg-destructive/5 cursor-pointer" : "cursor-pointer"}
                    onClick={() => setDetailId(fu.id)}
                  >
                    <TableCell className={`font-medium ${priorityColors[fu.priority] || ""}`}>
                      {fu.attendees?.first_name} {fu.attendees?.last_name}
                      {fu.priority === "urgent" && <span className="ml-1 text-destructive">(!)</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {fu.type || "outreach"}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{fu.method || "—"}</TableCell>
                    <TableCell className={overdue ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {fu.due_date ? (
                        <span className="flex items-center gap-1">
                          {overdue && <AlertTriangle className="h-3 w-3" />}
                          {new Date(fu.due_date).toLocaleDateString()}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {volunteerMap.get(fu.assigned_to) ?? <span className="italic">Unassigned</span>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Badge variant="outline" className={`gap-1 ${statusColors[fu.status] || ""}`}>
                        <Icon className="h-3 w-3" />
                        {fu.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {fu.attendees?.email && (
                            <DropdownMenuItem onClick={() => {
                              setEmailTarget({ email: fu.attendees.email, name: `${fu.attendees.first_name} ${fu.attendees.last_name}`, attendeeId: fu.attendee_id });
                              setEmailOpen(true);
                            }}>
                              <Mail className="h-4 w-4 mr-2" /> Send Email
                            </DropdownMenuItem>
                          )}
                          {fu.attendees?.phone && (
                            <DropdownMenuItem onClick={() => {
                              const name = `${fu.attendees.first_name} ${fu.attendees.last_name}`;
                              setSmsTarget({ phone: fu.attendees.phone, name, attendeeId: fu.attendee_id, followUpId: fu.id });
                              setSmsBody(`Hi ${fu.attendees.first_name}, this is HOTC! So glad you visited us. Let us know if there's anything we can pray for or help you get connected with. — The HOTC Family`);
                            }}>
                              <Send className="h-4 w-4 mr-2" /> Send Text
                            </DropdownMenuItem>
                          )}
                          {fu.status === "pending" && (
                            <DropdownMenuItem onClick={() => updateStatus.mutate({ id: fu.id, status: "contacted" })}>
                              <MessageSquare className="h-4 w-4 mr-2" /> Mark Contacted
                            </DropdownMenuItem>
                          )}
                          {fu.status === "contacted" && (
                            <DropdownMenuItem onClick={() => updateStatus.mutate({ id: fu.id, status: "connected" })}>
                              <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Connected
                            </DropdownMenuItem>
                          )}
                          {(fu.status === "pending" || fu.status === "contacted") && (
                            <DropdownMenuItem onClick={() => updateStatus.mutate({ id: fu.id, status: "closed" })}>
                              <XCircle className="h-4 w-4 mr-2" /> Close
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if (confirm("Delete this follow-up? This cannot be undone.")) {
                                deleteFollowUp.mutate(fu.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!followUps || followUps.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No follow-ups found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Detail side-sheet */}
        <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
          <SheetContent className="w-full sm:max-w-md overflow-auto">
            {detailFollowUp && (
              <>
                <SheetHeader className="mb-4">
                  <SheetTitle>
                    {detailFollowUp.attendees?.first_name} {detailFollowUp.attendees?.last_name}
                  </SheetTitle>
                </SheetHeader>
                <div className="space-y-2 text-sm mb-6">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="capitalize">{detailFollowUp.type || "outreach"}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={statusColors[detailFollowUp.status]}>
                      {detailFollowUp.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Priority</span>
                    <span className={priorityColors[detailFollowUp.priority] || ""}>{detailFollowUp.priority || "normal"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned to</span>
                    <span>{volunteerMap.get(detailFollowUp.assigned_to) ?? "Unassigned"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due</span>
                    <span>{detailFollowUp.due_date ? new Date(detailFollowUp.due_date).toLocaleDateString() : "—"}</span>
                  </div>
                  {detailFollowUp.notes && (
                    <div>
                      <span className="text-muted-foreground block mb-1">Notes</span>
                      <p className="bg-muted/40 rounded p-2">{detailFollowUp.notes}</p>
                    </div>
                  )}
                </div>
                <FollowUpActivityLog followUpId={detailFollowUp.id} />
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Email composer */}
        <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
            <DialogHeader><DialogTitle>Send Follow-Up Email</DialogTitle></DialogHeader>
            {emailTarget && (
              <EmailComposer
                defaultTo={emailTarget.email}
                defaultToName={emailTarget.name}
                defaultSubject="Follow-Up from House of the Cross"
                relatedAttendeeId={emailTarget.attendeeId}
                onSent={() => setEmailOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* SMS composer */}
        <Dialog open={!!smsTarget} onOpenChange={(o) => { if (!o) { setSmsTarget(null); setSmsBody(""); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Send Text {smsTarget ? `to ${smsTarget.name}` : ""}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">To: {smsTarget?.phone}</div>
              <Textarea
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                rows={6}
                maxLength={1600}
                placeholder="Your message..."
              />
              <div className="text-xs text-muted-foreground text-right">{smsBody.length} / 1600</div>
              <Button onClick={sendSms} disabled={smsSending || !smsBody.trim()} className="w-full">
                {smsSending ? "Sending..." : "Send Text"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

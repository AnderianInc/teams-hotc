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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CheckCircle2, Clock, XCircle, MessageSquare, Mail, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import EmailComposer from "@/components/admin/EmailComposer";

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

export default function FollowUpList() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<{ email: string; name: string; attendeeId: string } | null>(null);
  const [attendeeId, setAttendeeId] = useState("");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  const { data: followUps, isLoading } = useQuery({
    queryKey: ["follow-ups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_ups")
        .select("*, attendees(first_name, last_name, email), profiles:assigned_to(full_name)")
        .order("created_at", { ascending: false })
        .limit(100);
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

  const addFollowUp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("follow_ups").insert({
        attendee_id: attendeeId,
        method: method || null,
        notes: notes || null,
        due_date: dueDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up created!");
      setAddOpen(false);
      setAttendeeId(""); setMethod(""); setNotes(""); setDueDate("");
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "connected" || status === "closed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase.from("follow_ups").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-display font-semibold">Follow-Up Queue</h3>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Follow-Up
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Follow-Up</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addFollowUp.mutate(); }} className="space-y-4">
                <div className="space-y-1">
                  <Label>Visitor/Member</Label>
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

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {followUps?.map((fu: any) => {
                const Icon = statusIcons[fu.status] || Clock;
                return (
                  <TableRow key={fu.id}>
                    <TableCell className="font-medium">
                      {fu.attendees?.first_name} {fu.attendees?.last_name}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{fu.method || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fu.due_date ? new Date(fu.due_date).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${statusColors[fu.status] || ""}`}>
                        <Icon className="h-3 w-3" />
                        {fu.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {fu.attendees?.email && (
                            <DropdownMenuItem onClick={() => {
                              setEmailTarget({
                                email: fu.attendees.email,
                                name: `${fu.attendees.first_name} ${fu.attendees.last_name}`,
                                attendeeId: fu.attendee_id,
                              });
                              setEmailOpen(true);
                            }}>
                              <Mail className="h-4 w-4 mr-2" />
                              Send Email
                            </DropdownMenuItem>
                          )}
                          {fu.status === "pending" && (
                            <DropdownMenuItem onClick={() => updateStatus.mutate({ id: fu.id, status: "contacted" })}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Mark Contacted
                            </DropdownMenuItem>
                          )}
                          {fu.status === "contacted" && (
                            <DropdownMenuItem onClick={() => updateStatus.mutate({ id: fu.id, status: "connected" })}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Mark Connected
                            </DropdownMenuItem>
                          )}
                          {(fu.status === "pending" || fu.status === "contacted") && (
                            <DropdownMenuItem onClick={() => updateStatus.mutate({ id: fu.id, status: "closed" })}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Close
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!followUps || followUps.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No follow-ups yet. Create one to start tracking.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Email composer dialog */}
        <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Send Follow-Up Email</DialogTitle>
            </DialogHeader>
            {emailTarget && (
              <EmailComposer
                defaultTo={emailTarget.email}
                defaultToName={emailTarget.name}
                defaultSubject={`Follow-Up from House of Transformation Church`}
                relatedAttendeeId={emailTarget.attendeeId}
                onSent={() => setEmailOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

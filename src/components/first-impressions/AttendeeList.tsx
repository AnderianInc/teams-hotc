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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { UserPlus, Search, Phone, Mail, MapPin } from "lucide-react";

export default function AttendeeList() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", address: "", notes: "", tags: "",
  });

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

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

  const addAttendee = useMutation({
    mutationFn: async () => {
      const tags = form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
      const today = new Date().toISOString().split("T")[0];
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
      }).select("id").single();
      if (error) throw error;

      // Auto-create an outreach follow-up and place in pipeline for new first-time visitors
      if (data?.id) {
        const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        await (supabase.from as any)("follow_ups").insert({
          attendee_id: data.id,
          type: "outreach",
          status: "pending",
          prospect_pipeline_stage: "visited",
          due_date: dueDate,
          notes: `Auto-created: first-time visitor on ${today}`,
        });
      }
    },
    onSuccess: () => {
      toast.success("Visitor registered and added to outreach pipeline!");
      setAddOpen(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", address: "", notes: "", tags: "" });
      queryClient.invalidateQueries({ queryKey: ["attendees"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
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
              {attendees?.map((a) => (
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
                      {(a.tags || []).map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.is_member ? "default" : "outline"}>
                      {a.is_member ? "Member" : "Visitor"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!attendees || attendees.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No visitors registered yet.
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

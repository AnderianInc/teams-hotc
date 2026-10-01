import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarCheck, CheckCircle2, XCircle, MoreHorizontal, Phone, Mail,
  Users, Baby, MessageSquare, Calendar, Search, UserCheck,
} from "lucide-react";
import { format, isPast, parseISO } from "date-fns";

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  lead_type: string;
  visit_date: string;
  adults_count: number;
  kids_count: number;
  kids_ages: string | null;
  message: string | null;
  sms_opt_in: boolean;
  utm_source: string | null;
  utm_campaign: string | null;
  status: string;
  attendee_id: string | null;
  notes: string | null;
  preferred_team_ids: string[];
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  attended: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  no_show: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  cancelled: "bg-muted text-muted-foreground",
};

const LEAD_TYPE_STYLES: Record<string, string> = {
  visit: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  interest: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};

export default function PlannedVisits() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("upcoming");
  const [search, setSearch] = useState("");
  const [notesLead, setNotesLead] = useState<Lead | null>(null);
  const [notesText, setNotesText] = useState("");
  const [rescheduleLead, setRescheduleLead] = useState<Lead | null>(null);
  const [newDate, setNewDate] = useState("");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["funnel-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_leads")
        .select("*")
        .order("visit_date", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("funnel_leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["funnel-leads"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const markAttended = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("promote_funnel_lead", { _lead_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Marked as attended", description: "They're now in the Church Directory." });
      queryClient.invalidateQueries({ queryKey: ["funnel-leads"] });
    },
    onError: (e: any) => toast({ title: "Could not mark attended", description: e.message, variant: "destructive" }),
  });

  const saveNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("funnel_leads").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setNotesLead(null);
      queryClient.invalidateQueries({ queryKey: ["funnel-leads"] });
    },
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase
        .from("funnel_leads")
        .update({ visit_date: date, status: "planned" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRescheduleLead(null);
      toast({ title: "Visit rescheduled" });
      queryClient.invalidateQueries({ queryKey: ["funnel-leads"] });
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const filtered = leads.filter((l) => {
    if (statusFilter === "upcoming" && !(l.status === "planned" || l.status === "confirmed")) return false;
    if (statusFilter !== "upcoming" && statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${l.first_name} ${l.last_name} ${l.email || ""} ${l.phone || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    upcoming: leads.filter((l) => l.status === "planned" || l.status === "confirmed").length,
    attended: leads.filter((l) => l.status === "attended").length,
    no_show: leads.filter((l) => l.status === "no_show").length,
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <CalendarCheck className="h-6 w-6" /> Planned Visits
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          People who planned a visit through the website or ads. Mark them attended when they arrive
          to add them to the Church Directory.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-4 text-center">
          <div className="text-2xl font-bold">{counts.upcoming}</div>
          <div className="text-xs text-muted-foreground">Upcoming</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center">
          <div className="text-2xl font-bold">{counts.attended}</div>
          <div className="text-xs text-muted-foreground">Attended</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center">
          <div className="text-2xl font-bold">{counts.no_show}</div>
          <div className="text-xs text-muted-foreground">No-shows</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="attended">Attended</SelectItem>
            <SelectItem value="no_show">No-shows</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No planned visits here yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => {
            const visitPast = isPast(parseISO(lead.visit_date)) && lead.visit_date < today;
            return (
              <Card key={lead.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          {lead.first_name} {lead.last_name}
                        </span>
                        <Badge className={STATUS_STYLES[lead.status] || ""} variant="secondary">
                          {lead.status.replace("_", " ")}
                        </Badge>
                        {lead.utm_source && (
                          <Badge variant="outline" className="text-xs">
                            via {lead.utm_source}{lead.utm_campaign ? ` / ${lead.utm_campaign}` : ""}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(parseISO(lead.visit_date), "EEE, MMM d, yyyy")}
                          {visitPast && (lead.status === "planned" || lead.status === "confirmed") && (
                            <span className="text-amber-600 dark:text-amber-400">(date passed)</span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {lead.adults_count} adult{lead.adults_count !== 1 ? "s" : ""}
                        </span>
                        {lead.kids_count > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Baby className="h-3.5 w-3.5" /> {lead.kids_count} kid{lead.kids_count !== 1 ? "s" : ""}
                            {lead.kids_ages ? ` (${lead.kids_ages})` : ""}
                          </span>
                        )}
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3.5 w-3.5" /> {lead.phone}
                          </a>
                        )}
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                            <Mail className="h-3.5 w-3.5" /> {lead.email}
                          </a>
                        )}
                      </div>
                      {lead.message && (
                        <p className="text-sm text-muted-foreground flex items-start gap-1">
                          <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {lead.message}
                        </p>
                      )}
                      {lead.notes && (
                        <p className="text-sm italic text-muted-foreground">Note: {lead.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(lead.status === "planned" || lead.status === "confirmed" || lead.status === "no_show") && (
                        <Button
                          size="sm"
                          onClick={() => markAttended.mutate(lead.id)}
                          disabled={markAttended.isPending}
                        >
                          <UserCheck className="h-4 w-4 mr-1" /> Mark Attended
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {lead.status !== "no_show" && lead.status !== "attended" && (
                            <DropdownMenuItem onClick={() => updateStatus.mutate({ id: lead.id, status: "no_show" })}>
                              <XCircle className="h-4 w-4 mr-2" /> Mark No-show
                            </DropdownMenuItem>
                          )}
                          {lead.status !== "attended" && (
                            <DropdownMenuItem onClick={() => { setRescheduleLead(lead); setNewDate(""); }}>
                              <Calendar className="h-4 w-4 mr-2" /> Reschedule
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { setNotesLead(lead); setNotesText(lead.notes || ""); }}>
                            <MessageSquare className="h-4 w-4 mr-2" /> Add Note
                          </DropdownMenuItem>
                          {lead.status !== "attended" && lead.status !== "cancelled" && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => updateStatus.mutate({ id: lead.id, status: "cancelled" })}
                            >
                              <XCircle className="h-4 w-4 mr-2" /> Cancel Visit
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!notesLead} onOpenChange={(o) => !o && setNotesLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Note for {notesLead?.first_name}</DialogTitle></DialogHeader>
          <Textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} rows={4} />
          <DialogFooter>
            <Button onClick={() => notesLead && saveNotes.mutate({ id: notesLead.id, notes: notesText })}>
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rescheduleLead} onOpenChange={(o) => !o && setRescheduleLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reschedule {rescheduleLead?.first_name}'s visit</DialogTitle></DialogHeader>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <DialogFooter>
            <Button
              disabled={!newDate}
              onClick={() => rescheduleLead && reschedule.mutate({ id: rescheduleLead.id, date: newDate })}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

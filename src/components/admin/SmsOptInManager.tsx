import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { MessageSquare, Search } from "lucide-react";

type Row = {
  key: string;
  kind: "attendee" | "profile";
  id: string;
  name: string;
  phone: string | null;
  sms_opt_in: boolean;
  source: string | null;
};

export default function SmsOptInManager() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "opted_in" | "not_opted_in">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sms-opt-in-rows"],
    queryFn: async () => {
      const [att, prof] = await Promise.all([
        supabase.from("attendees").select("id, first_name, last_name, phone, sms_opt_in, sms_opt_in_source").not("phone", "is", null),
        supabase.from("profiles").select("user_id, full_name, phone, sms_opt_in, sms_opt_in_source").not("phone", "is", null),
      ]);
      const list: Row[] = [];
      (att.data || []).forEach((a: any) => list.push({
        key: `a:${a.id}`,
        kind: "attendee",
        id: a.id,
        name: `${a.first_name} ${a.last_name}`.trim(),
        phone: a.phone,
        sms_opt_in: !!a.sms_opt_in,
        source: a.sms_opt_in_source,
      }));
      (prof.data || []).forEach((p: any) => list.push({
        key: `p:${p.user_id}`,
        kind: "profile",
        id: p.user_id,
        name: p.full_name || "(no name)",
        phone: p.phone,
        sms_opt_in: !!p.sms_opt_in,
        source: p.sms_opt_in_source,
      }));
      return list.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (filter === "opted_in" && !r.sms_opt_in) return false;
      if (filter === "not_opted_in" && r.sms_opt_in) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.phone || "").toLowerCase().includes(q);
    });
  }, [rows, search, filter]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.key));
  const someChecked = filtered.some((r) => selected.has(r.key));

  const toggleOne = (key: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allChecked) filtered.forEach((r) => next.delete(r.key));
      else filtered.forEach((r) => next.add(r.key));
      return next;
    });
  };

  const bulkUpdate = useMutation({
    mutationFn: async ({ opt_in }: { opt_in: boolean }) => {
      const targets = rows.filter((r) => selected.has(r.key));
      const attendeeIds = targets.filter((t) => t.kind === "attendee").map((t) => t.id);
      const profileIds = targets.filter((t) => t.kind === "profile").map((t) => t.id);
      const patch = {
        sms_opt_in: opt_in,
        sms_opt_in_source: opt_in ? "admin_bulk_override" : "admin_bulk_revoked",
        sms_opt_in_at: new Date().toISOString(),
      };
      if (attendeeIds.length) {
        const { error } = await supabase.from("attendees").update(patch).in("id", attendeeIds);
        if (error) throw error;
      }
      if (profileIds.length) {
        const { error } = await supabase.from("profiles").update(patch).in("user_id", profileIds);
        if (error) throw error;
      }
      return targets.length;
    },
    onSuccess: (n, vars) => {
      toast.success(`${vars.opt_in ? "Opted in" : "Opted out"} ${n} contact${n === 1 ? "" : "s"}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["sms-opt-in-rows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const singleToggle = useMutation({
    mutationFn: async (r: Row) => {
      const opt_in = !r.sms_opt_in;
      const patch = {
        sms_opt_in: opt_in,
        sms_opt_in_source: opt_in ? "admin_override" : "admin_revoked",
        sms_opt_in_at: new Date().toISOString(),
      };
      if (r.kind === "attendee") {
        const { error } = await supabase.from("attendees").update(patch).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profiles").update(patch).eq("user_id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms-opt-in-rows"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const optedInCount = rows.filter((r) => r.sms_opt_in).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> SMS opt-in
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            {optedInCount} of {rows.length} opted in
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
          Only opt people in when you have <strong>verbal or written consent</strong>. Bulk opt-in is logged as an admin override.
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="opted_in">Opted in</TabsTrigger>
              <TabsTrigger value="not_opted_in">Not opted in</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">{selected.size} selected</Badge>
          <div className="flex-1" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={selected.size === 0 || bulkUpdate.isPending}>
                Opt in selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bulk opt {selected.size} contact{selected.size === 1 ? "" : "s"} in?</AlertDialogTitle>
                <AlertDialogDescription>
                  Only continue if you have recorded consent for each selected person. This will be logged as an admin bulk override.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => bulkUpdate.mutate({ opt_in: true })}>Confirm opt-in</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="destructive" disabled={selected.size === 0 || bulkUpdate.isPending} onClick={() => bulkUpdate.mutate({ opt_in: false })}>
            Opt out selected
          </Button>
        </div>

        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>SMS opt-in</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No contacts match</TableCell></TableRow>
              ) : (
                filtered.slice(0, 500).map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggleOne(r.key)} />
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                    <TableCell>
                      {r.sms_opt_in ? <Badge>Opted in</Badge> : <Badge variant="outline">Not opted in</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.source || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => singleToggle.mutate(r)} disabled={singleToggle.isPending}>
                        {r.sms_opt_in ? "Opt out" : "Opt in"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 500 && (
          <p className="text-xs text-muted-foreground">Showing first 500. Refine the search to narrow down.</p>
        )}
      </CardContent>
    </Card>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Inbox, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

const SOURCE_LABEL: Record<string, string> = {
  prayer: "Prayer requests",
  visit: "Visit requests",
  interest: "Interest meetings",
};

export default function ExternalSourcesPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("pending_review");

  const { data: state = [] } = useQuery({
    queryKey: ["external-sync-state"],
    queryFn: async () => {
      const { data, error } = await supabase.from("external_sync_state").select("*");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: records = [] } = useQuery({
    queryKey: ["external-records", filter],
    queryFn: async () => {
      let q = supabase.from("external_records").select("*").order("received_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: sequences = [] } = useQuery({
    queryKey: ["outreach-sequences"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_sequences").select("*").order("source").order("step_order");
      if (error) throw error;
      return data || [];
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("outreach-sync", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sync complete: ${JSON.stringify(data?.summary || {})}`);
      qc.invalidateQueries({ queryKey: ["external-sync-state"] });
      qc.invalidateQueries({ queryKey: ["external-records"] });
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("external_records").update({ status, processed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-records"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSeq = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("outreach_sequences").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach-sequences"] });
      toast.success("Sequence updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stateBy = new Map(state.map((s: any) => [s.source, s]));

  return (
    <div className="space-y-6">
      {/* Sync status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" /> External sources
          </CardTitle>
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["prayer", "visit", "interest"] as const).map((src) => {
            const s: any = stateBy.get(src);
            const ok = s?.last_run_status === "ok";
            return (
              <div key={src} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{SOURCE_LABEL[src]}</span>
                  {s ? (
                    ok ? (
                      <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Error</Badge>
                    )
                  ) : (
                    <Badge variant="outline">Never</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {s?.last_synced_at ? `Last sync ${formatDistanceToNow(new Date(s.last_synced_at))} ago` : "Not synced yet"}
                </p>
                {s?.records_imported != null && (
                  <p className="text-xs text-muted-foreground">{s.records_imported} imported last run</p>
                )}
                {s?.last_error && (
                  <p className="text-xs text-destructive break-words">{s.last_error}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Review queue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Incoming records</CardTitle>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending_review">Pending review</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="merged">Merged</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{SOURCE_LABEL[r.source]}</Badge></TableCell>
                  <TableCell>{r.payload?.name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.payload?.email || ""} {r.payload?.phone || ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.received_at))} ago
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "merged" ? "default" : r.status === "created" ? "secondary" : r.status === "ignored" ? "outline" : "destructive"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {r.status === "pending_review" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "merged" })}>Confirm merge</Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: r.id, status: "ignored" })}>Ignore</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No records</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sequence editor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outreach sequences</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Offset</TableHead>
                <TableHead>Anchor</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sequences.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell><Badge variant="outline">{s.source}</Badge></TableCell>
                  <TableCell>{s.step_order}</TableCell>
                  <TableCell className="text-xs">{s.description || s.template_slug}</TableCell>
                  <TableCell>{s.channel}</TableCell>
                  <TableCell>{s.audience}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      defaultValue={s.offset_days}
                      className="h-8 w-20"
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v) && v !== s.offset_days) updateSeq.mutate({ id: s.id, patch: { offset_days: v } });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-xs">{s.anchor}</TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      defaultChecked={s.active}
                      onChange={(e) => updateSeq.mutate({ id: s.id, patch: { active: e.target.checked } })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

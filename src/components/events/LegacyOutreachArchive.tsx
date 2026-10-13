import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableRowActions } from "@/components/ui/table-row-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEGACY_TABLES, legacyCsv, readAllPages } from "@/lib/legacyOutreach";
import { Download } from "lucide-react";

const labels = { external_records: "Contacts & requests", outreach_sequences: "Old workflows", outreach_sequence_runs: "Message history" };
type LegacyRow = Record<string, any>;

export default function LegacyOutreachArchive() {
  const [table, setTable] = useState<(typeof LEGACY_TABLES)[number]>("external_records");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<LegacyRow | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["legacy-outreach-archive"],
    staleTime: 60_000,
    queryFn: async () => {
      const result = await Promise.all(LEGACY_TABLES.map(async (name) => {
        const rows = await readAllPages<LegacyRow>(async (from, to) => await supabase.from(name).select("*").order("id").range(from, to));
        return [name, rows] as const;
      }));
      return Object.fromEntries(result) as Record<(typeof LEGACY_TABLES)[number], LegacyRow[]>;
    },
  });
  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const rows = (data?.[table] || []).filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Planned Outreach archive</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!data} onClick={() => data && download("planned-outreach-backup.json", JSON.stringify({ exported_at: new Date().toISOString(), tables: data }, null, 2), "application/json")}><Download className="mr-2 h-4 w-4" />Download full backup</Button>
        <Button variant="outline" size="sm" disabled={!data} onClick={() => data && download(`${table}.csv`, legacyCsv(data[table]), "text/csv;charset=utf-8")}><Download className="mr-2 h-4 w-4" />Download CSV</Button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {LEGACY_TABLES.map((name) => <Button key={name} size="sm" variant={table === name ? "secondary" : "ghost"} onClick={() => { setTable(name); setSearch(""); }}>{labels[name]}{data ? ` (${data[name].length})` : ""}</Button>)}
      <Input className="ml-auto max-w-xs" aria-label="Search old outreach" placeholder="Search old outreach…" value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
    {error ? <p role="alert" className="text-destructive">Unable to load the complete archive: {error.message}</p> : isLoading ? <p className="text-muted-foreground">Loading archive…</p> : <Table>
      <TableHeader><TableRow><TableHead>{table === "external_records" ? "Name" : "Step"}</TableHead><TableHead>Source / channel</TableHead><TableHead>Contact / template</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row) => <TableRow key={row.id}>
        <TableCell>{row.payload?.name || [row.payload?.first_name, row.payload?.last_name].filter(Boolean).join(" ") || row.description || row.subject || row.step_order || "—"}</TableCell>
        <TableCell>{row.source || row.channel || "—"}</TableCell>
        <TableCell className="break-words">{[row.payload?.email, row.payload?.phone].filter(Boolean).join(" · ") || row.recipient || row.template_slug || "—"}</TableCell>
        <TableCell>{row.status || (row.active ? "Active" : "Inactive")}</TableCell>
        <TableCell>{row.received_at || row.sent_at || row.created_at ? new Date(row.received_at || row.sent_at || row.created_at).toLocaleDateString() : "—"}</TableCell>
        <TableCell className="text-right"><TableRowActions label={`archive ${row.id}`} actions={[{ label: "View all details", onSelect: () => setDetail(row) }]} /></TableCell>
      </TableRow>)}{!rows.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No records</TableCell></TableRow>}</TableBody>
    </Table>}
    <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Original outreach details</DialogTitle></DialogHeader><dl className="space-y-3">{Object.entries(detail || {}).map(([key, value]) => <div key={key}><dt className="text-sm font-medium">{key.replace(/_/g, " ")}</dt><dd className="text-sm text-muted-foreground whitespace-pre-wrap break-all">{typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value ?? "—")}</dd></div>)}</dl></DialogContent></Dialog>
  </section>;
}
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    // Respect quoted fields
    const cols: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });
}

type ImportResult = { ok: number; skipped: number; errors: string[] };

// ── Volunteer import ──────────────────────────────────────────────────────────
// Expected columns: email, full_name, team (team name, optional), role (optional)
async function importVolunteers(rows: Record<string, string>[]): Promise<ImportResult> {
  const result: ImportResult = { ok: 0, skipped: 0, errors: [] };

  // Fetch existing teams for name→id lookup
  const { data: teams } = await supabase.from("teams").select("id, name");
  const teamMap = new Map((teams ?? []).map((t) => [t.name.toLowerCase(), t.id]));

  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    const fullName = (row.full_name ?? row.name ?? "").trim();
    if (!email) { result.errors.push(`Row missing email: ${JSON.stringify(row)}`); continue; }

    // Check if profile already exists
    const { data: existing } = await supabase.from("profiles").select("user_id").eq("email", email).maybeSingle();
    if (existing) { result.skipped++; continue; }

    // Send invite via existing Edge Function
    const teamName = (row.team ?? "").trim();
    const teamId = teamMap.get(teamName.toLowerCase()) ?? null;
    const role = (row.role ?? "member").trim() || "member";

    try {
      const { error } = await supabase.functions.invoke("invite-volunteer", {
        body: { email, teamId: teamId ?? "", role, fullName },
      });
      if (error) throw new Error(error.message);
      result.ok++;
    } catch (e: any) {
      result.errors.push(`${email}: ${e.message}`);
    }
  }
  return result;
}

// ── Family import ─────────────────────────────────────────────────────────────
// Expected columns: family_name, parent1_name, parent1_phone,
//                   parent2_name (opt), parent2_phone (opt),
//                   children — semicolon-separated "First Last;DOB(yyyy-mm-dd);grade_group" tuples (opt)
async function importFamilies(rows: Record<string, string>[]): Promise<ImportResult> {
  const result: ImportResult = { ok: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    const familyName = (row.family_name ?? row.family ?? "").trim();
    const p1Name = (row.parent1_name ?? row.parent_name ?? "").trim();
    const p1Phone = (row.parent1_phone ?? row.phone ?? "").trim();
    if (!familyName || !p1Name) {
      result.errors.push(`Row missing family_name or parent1_name: ${JSON.stringify(row)}`);
      continue;
    }

    // Skip if family already exists by phone
    const { data: existing } = await supabase
      .from("families")
      .select("id")
      .eq("parent1_phone", p1Phone)
      .maybeSingle();
    if (existing) { result.skipped++; continue; }

    const { data: family, error: famErr } = await supabase
      .from("families")
      .insert({
        family_name: familyName,
        parent1_name: p1Name,
        parent1_phone: p1Phone || null,
        parent2_name: (row.parent2_name ?? "").trim() || null,
        parent2_phone: (row.parent2_phone ?? "").trim() || null,
      })
      .select("id")
      .single();
    if (famErr) { result.errors.push(`${familyName}: ${famErr.message}`); continue; }

    // Import children if provided
    const childrenStr = (row.children ?? "").trim();
    if (childrenStr && family) {
      const childEntries = childrenStr.split(";").map((s) => s.trim()).filter(Boolean);
      for (const entry of childEntries) {
        const [namePart, dob, gradeGroup] = entry.split("|").map((s) => s.trim());
        const parts = (namePart ?? "").split(" ");
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ");
        if (!firstName) continue;
        await supabase.from("children").insert({
          first_name: firstName,
          last_name: lastName || null,
          date_of_birth: dob || null,
          grade_group: gradeGroup || null,
          family_id: family.id,
        });
      }
    }

    result.ok++;
  }
  return result;
}

// ── UI ────────────────────────────────────────────────────────────────────────
function ImportPane({
  label,
  templateHeaders,
  templateExample,
  onImport,
}: {
  label: string;
  templateHeaders: string;
  templateExample: string;
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");

  const run = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) throw new Error("No data rows found. Check the file format.");
      return onImport(rows);
    },
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries();
      if (res.ok > 0) toast.success(`${res.ok} ${label.toLowerCase()} imported`);
      if (res.errors.length) toast.error(`${res.errors.length} rows had errors`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadTemplate = () => {
    const blob = new Blob([`${templateHeaders}\n${templateExample}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.toLowerCase().replace(" ", "-")}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Upload a CSV file to bulk-import {label.toLowerCase()}. Download the template below to see the required columns.
        </p>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <FileText className="h-4 w-4 mr-1" /> Download Template
        </Button>
      </div>

      <div
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) { setFileName(file.name); run.mutate(file); }
        }}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">{fileName || "Click or drag a CSV file here"}</p>
        <p className="text-xs text-muted-foreground mt-1">Only .csv files are supported</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { setFileName(file.name); run.mutate(file); }
          }}
        />
      </div>

      {run.isPending && (
        <p className="text-sm text-muted-foreground text-center animate-pulse">Importing…</p>
      )}

      {result && (
        <div className="rounded-md border p-4 space-y-2">
          <div className="flex gap-3 flex-wrap">
            <Badge className="gap-1 bg-success/10 text-success border-success/30">
              <CheckCircle2 className="h-3.5 w-3.5" /> {result.ok} imported
            </Badge>
            {result.skipped > 0 && (
              <Badge variant="outline" className="gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {result.skipped} skipped (already exist)
              </Badge>
            )}
            {result.errors.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3.5 w-3.5" /> {result.errors.length} errors
              </Badge>
            )}
          </div>
          {result.errors.length > 0 && (
            <ul className="text-xs text-destructive space-y-0.5 max-h-32 overflow-y-auto">
              {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function BulkImport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Bulk Import
        </CardTitle>
        <CardDescription>
          Import volunteers or families from a CSV file. Existing records are skipped automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="volunteers">
          <TabsList className="mb-4">
            <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
            <TabsTrigger value="families">Families</TabsTrigger>
          </TabsList>
          <TabsContent value="volunteers">
            <ImportPane
              label="Volunteers"
              templateHeaders="email,full_name,team,role"
              templateExample="jane@example.com,Jane Smith,Worship,member"
              onImport={importVolunteers}
            />
          </TabsContent>
          <TabsContent value="families">
            <ImportPane
              label="Families"
              templateHeaders="family_name,parent1_name,parent1_phone,parent2_name,parent2_phone,children"
              templateExample='Smith Family,John Smith,5551234567,Mary Smith,5557654321,"Emma Smith|2015-06-12|elementary"'
              onImport={importFamilies}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

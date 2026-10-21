import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ageInYears } from "@/lib/kidsClasses";
import { getPrinterStatus, printNameTag } from "@/lib/brotherPrinter";

/** Young Adults (15–19) roster with simple per-day attendance check-in. */
export default function YoungAdultStudents() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading } = useQuery({
    queryKey: ["young-adult-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("children")
        .select("id, first_name, last_name, date_of_birth, families(parent1_name, parent1_phone)")
        .eq("grade_group", "Young Adults")
        .order("first_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: present } = useQuery({
    queryKey: ["young-adult-attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("young_adult_attendance").select("child_id").eq("service_date", date);
      if (error) throw error;
      return new Set((data || []).map((r) => r.child_id));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const q = supabase.from("young_adult_attendance");
      const { error } = on
        ? await q.insert({ child_id: id, service_date: date, marked_by: user?.id ?? null })
        : await q.delete().eq("child_id", id).eq("service_date", date);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["young-adult-attendance", date] }),
    onError: (e: Error) => toast.error(`Could not update attendance: ${e.message}`),
  });

  const printTag = useMutation({
    mutationFn: async (c: any) => {
      if (!getPrinterStatus().connected) throw new Error("Connect a printer first (Check-In page or Printer settings).");
      await printNameTag({
        copy: "child",
        childName: `${c.first_name} ${c.last_name}`.trim(),
        roomName: "Young Adults",
        securityCode: "",
        parentName: c.families?.parent1_name ?? null,
        date: format(new Date(), "EEE, MMM d yyyy"),
      });
    },
    onSuccess: () => toast.success("Name tag sent to printer."),
    onError: (e: Error) => toast.error(`Print failed: ${e.message}`),
  });

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          Students check-in (ages 15–19){present ? ` · ${present.size} present` : ""}
        </CardTitle>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40 h-8" aria-label="Attendance date" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No students have aged into Young Adults yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Here</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead className="w-16">Tag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Checkbox
                      checked={!!present?.has(c.id)}
                      disabled={toggle.isPending}
                      onCheckedChange={(v) => toggle.mutate({ id: c.id, on: !!v })}
                      aria-label={`Mark ${c.first_name} present`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                  <TableCell>{ageInYears(c.date_of_birth) ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {c.families?.parent1_name ?? "—"}
                    {c.families?.parent1_phone ? <span className="text-muted-foreground"> · {c.families.parent1_phone}</span> : null}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      disabled={printTag.isPending}
                      onClick={() => printTag.mutate(c)}
                      aria-label={`Print name tag for ${c.first_name}`}
                      title={`Print name tag for ${c.first_name}`}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

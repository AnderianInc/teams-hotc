import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ageInYears } from "@/lib/kidsClasses";

/** Children registered in Kids Check-In who have aged into Young Adults (15–19). */
export default function YoungAdultStudents() {
  const { data, isLoading } = useQuery({
    queryKey: ["young-adult-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("children")
        .select("id, first_name, last_name, date_of_birth, families(parent1_name, parent1_phone)")
        .eq("grade_group", "Young Adults")
        .order("date_of_birth");
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Students moved up from Children's Ministry (ages 15–19)</CardTitle>
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
                <TableHead>Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Parent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                  <TableCell>{ageInYears(c.date_of_birth) ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {c.families?.parent1_name ?? "—"}
                    {c.families?.parent1_phone ? <span className="text-muted-foreground"> · {c.families.parent1_phone}</span> : null}
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

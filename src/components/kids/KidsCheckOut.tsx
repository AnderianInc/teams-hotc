import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Search, LogOut, Clock, CheckCheck } from "lucide-react";
import { format } from "date-fns";

interface CheckedInRow {
  id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  child_id: string;
  room_id: string | null;
  children: {
    first_name: string;
    last_name: string;
    allergies: string | null;
    families: { parent1_name: string; parent1_phone: string } | null;
  } | null;
  rooms: { name: string } | null;
}

export default function KidsCheckOut() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Today's service date range
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: checkins = [], isLoading } = useQuery({
    queryKey: ["todays-checkins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("id, checked_in_at, checked_out_at, child_id, room_id, children(first_name, last_name, allergies, families(parent1_name, parent1_phone)), rooms(name)")
        .gte("checked_in_at", todayStart.toISOString())
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CheckedInRow[];
    },
    refetchInterval: 30_000,
  });

  const checkout = useMutation({
    mutationFn: async (checkInId: string) => {
      const { error } = await supabase
        .from("check_ins")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("id", checkInId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Child checked out successfully");
      queryClient.invalidateQueries({ queryKey: ["todays-checkins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = checkins.filter((c) => {
    if (!search) return true;
    const name = `${c.children?.first_name ?? ""} ${c.children?.last_name ?? ""}`.toLowerCase();
    const parent = (c.children?.families?.parent1_name ?? "").toLowerCase();
    const phone = (c.children?.families?.parent1_phone ?? "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || parent.includes(q) || phone.includes(q);
  });

  const stillIn = filtered.filter((c) => !c.checked_out_at);
  const checkedOut = filtered.filter((c) => c.checked_out_at);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5" />
              Guardian Pickup
            </CardTitle>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-warning" />
                {stillIn.length} still checked in
              </span>
              <span className="flex items-center gap-1">
                <CheckCheck className="h-4 w-4 text-success" />
                {checkedOut.length} checked out
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by child or parent name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading check-ins…</p>
          ) : stillIn.length === 0 && checkedOut.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No check-ins recorded today.</p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Child</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Guardian</TableHead>
                    <TableHead>Checked In</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Still checked in — shown first */}
                  {stillIn.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {c.children?.first_name} {c.children?.last_name}
                          </p>
                          {c.children?.allergies && (
                            <p className="text-xs text-destructive">⚠ {c.children.allergies}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{c.rooms?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>
                          <p>{c.children?.families?.parent1_name ?? "—"}</p>
                          <p className="text-muted-foreground text-xs">{c.children?.families?.parent1_phone}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(c.checked_in_at), "h:mm a")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">
                          In room
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => checkout.mutate(c.id)}
                          disabled={checkout.isPending}
                        >
                          <LogOut className="h-3.5 w-3.5 mr-1" /> Check Out
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Already checked out */}
                  {checkedOut.map((c) => (
                    <TableRow key={c.id} className="opacity-50">
                      <TableCell>
                        <p className="font-medium text-sm">
                          {c.children?.first_name} {c.children?.last_name}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{c.rooms?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.children?.families?.parent1_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(c.checked_in_at), "h:mm a")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">
                          <CheckCheck className="h-3 w-3 mr-1" />
                          Out {format(new Date(c.checked_out_at!), "h:mm a")}
                        </Badge>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

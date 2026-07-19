import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

export default function CheckedInToday() {
  const today = new Date().toISOString().slice(0, 10);

  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["check-ins-today", today],
    refetchInterval: 15000,
    queryFn: async () => {
      const start = new Date(today + "T00:00:00").toISOString();
      const end = new Date(today + "T23:59:59.999").toISOString();
      const { data, error } = await supabase
        .from("check_ins")
        .select(
          "id, checked_in_at, checked_out_at, security_code, children(first_name, last_name, grade_group), rooms(name)"
        )
        .gte("checked_in_at", start)
        .lte("checked_in_at", end)
        .order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const total = data?.length ?? 0;
  const present = data?.filter((c: any) => !c.checked_out_at).length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Checked in — {dateLabel}
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary">{present} present</Badge>
            <Badge variant="outline">{total} total</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">No check-ins yet today.</p>
        ) : (
          <ul className="divide-y">
            {data!.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">
                    {c.children?.first_name} {c.children?.last_name}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {c.children?.grade_group || "—"}
                    {c.rooms?.name ? ` · ${c.rooms.name}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.checked_in_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {c.checked_out_at && (
                    <Badge variant="outline" className="text-xs">
                      Out
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

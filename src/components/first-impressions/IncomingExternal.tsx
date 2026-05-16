import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const LABEL: Record<string, string> = {
  prayer: "Prayer",
  visit: "Visit",
  interest: "Interest",
};

export default function IncomingExternal() {
  const { data: records = [] } = useQuery({
    queryKey: ["fi-incoming-external"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("external_records")
        .select("*")
        .gte("received_at", cutoff)
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  if (records.length === 0) return null;

  const grouped = records.reduce<Record<string, any[]>>((acc, r: any) => {
    (acc[r.source] = acc[r.source] || []).push(r);
    return acc;
  }, {});

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Inbox className="h-4 w-4" /> Incoming from external sources (last 14 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(grouped).map(([src, items]) => (
          <div key={src} className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{LABEL[src]} ({items.length})</p>
            <div className="flex flex-wrap gap-2">
              {items.slice(0, 12).map((r: any) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
                  <span className="font-medium">{r.payload?.name || "—"}</span>
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  <span className="text-muted-foreground">{formatDistanceToNow(new Date(r.received_at))} ago</span>
                </div>
              ))}
              {items.length > 12 && <span className="text-xs text-muted-foreground">+{items.length - 12} more</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

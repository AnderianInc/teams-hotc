import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, Archive, Check, RefreshCw, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

type Filter = "new" | "read" | "archived" | "all";

export default function SmsInbox() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("new");

  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ["sms-inbound", filter],
    queryFn: async () => {
      let q = supabase
        .from("sms_inbound")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("sms_inbound").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["sms-inbound"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Inbox (Received Texts)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="new">New</TabsTrigger>
              <TabsTrigger value="read">Read</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : !messages?.length ? (
          <p className="text-muted-foreground text-center py-8">
            No {filter === "all" ? "" : filter} messages.
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((m: any) => (
              <div
                key={m.id}
                className={`border rounded-md p-3 ${m.status === "new" ? "bg-accent/30 border-primary/30" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {m.from_name ?? m.from_phone}
                    </span>
                    {m.from_name && (
                      <span className="text-muted-foreground text-xs">{m.from_phone}</span>
                    )}
                    {m.related_attendee_id && (
                      <Link
                        to={`/admin/directory/${m.related_attendee_id}`}
                        className="text-xs text-primary inline-flex items-center gap-0.5 hover:underline"
                      >
                        Profile <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    {m.status === "new" && <Badge>new</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(m.received_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                {!!m.media_urls?.length && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.media_urls.map((u: string, i: number) => (
                      <a
                        key={i}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Media {i + 1}
                      </a>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  {m.status !== "read" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(m.id, "read")}>
                      <Check className="h-3 w-3 mr-1" /> Mark read
                    </Button>
                  )}
                  {m.status !== "archived" && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatus(m.id, "archived")}>
                      <Archive className="h-3 w-3 mr-1" /> Archive
                    </Button>
                  )}
                  {m.status === "archived" && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatus(m.id, "new")}>
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

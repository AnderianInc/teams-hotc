import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquare, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";

export default function SmsLog() {
  const { data: messages, isLoading } = useQuery({
    queryKey: ["sms-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Sent Texts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : !messages?.length ? (
          <p className="text-muted-foreground text-center py-8">No texts sent yet.</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((msg) => (
                  <TableRow key={msg.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format(new Date(msg.sent_at), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>
                      {msg.to_name && (
                        <span className="font-medium">{msg.to_name} </span>
                      )}
                      <span className="text-muted-foreground text-sm">{msg.to_phone}</span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{msg.body}</TableCell>
                    <TableCell>
                      <Badge variant={msg.status === "sent" ? "default" : "destructive"}>
                        {msg.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 row-actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Text to {msg.to_name ?? msg.to_phone}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-2 text-sm">
                            <p className="text-muted-foreground">
                              <strong>To:</strong>{" "}
                              {msg.to_name ? `${msg.to_name} (${msg.to_phone})` : msg.to_phone}
                            </p>
                            <p className="text-muted-foreground">
                              <strong>Sent:</strong>{" "}
                              {format(new Date(msg.sent_at), "PPpp")}
                            </p>
                            {msg.provider_message_id && (
                              <p className="text-muted-foreground font-mono text-xs">
                                SID: {msg.provider_message_id}
                              </p>
                            )}
                            {msg.error && (
                              <p className="text-destructive text-xs">Error: {msg.error}</p>
                            )}
                            <div className="border rounded-md p-3 bg-muted/30 whitespace-pre-wrap">
                              {msg.body}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

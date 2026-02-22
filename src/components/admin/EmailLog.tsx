import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, Eye, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

export default function EmailLog() {
  const { data: emails, isLoading } = useQuery({
    queryKey: ["email-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_log")
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
          <Mail className="h-5 w-5" />
          Sent Emails
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : !emails?.length ? (
          <p className="text-muted-foreground text-center py-8">No emails sent yet.</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email: any) => (
                  <TableRow key={email.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {email.sent_at ? format(new Date(email.sent_at), "MMM d, yyyy h:mm a") : "—"}
                    </TableCell>
                    <TableCell>
                      <div>
                        {email.to_name && <span className="font-medium">{email.to_name} </span>}
                        <span className="text-muted-foreground text-sm">{email.to_email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{email.subject}</TableCell>
                    <TableCell>
                      <Badge variant={email.status === "sent" ? "default" : "secondary"}>
                        {email.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 row-actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>{email.subject}</DialogTitle>
                          </DialogHeader>
                          <div className="text-sm text-muted-foreground mb-2">
                            To: {email.to_name && `${email.to_name} `}&lt;{email.to_email}&gt;
                          </div>
                          {email.body_html ? (
                            <div
                              className="prose prose-sm max-w-none border rounded-md p-4"
                              dangerouslySetInnerHTML={{ __html: email.body_html }}
                            />
                          ) : (
                            <p className="text-muted-foreground">No body content</p>
                          )}
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

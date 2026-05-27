import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MoreHorizontal, Trash2, Eye, FileText, AlertCircle, RotateCw, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { toast } from "sonner";

export default function EmailLog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<any>(null);
  const [saveAsTpl, setSaveAsTpl] = useState<any>(null);
  const [tplName, setTplName] = useState("");
  const [tplSlug, setTplSlug] = useState("");
  const [tplPlaceholders, setTplPlaceholders] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);

  const { data: emails, isLoading } = useQuery({
    queryKey: ["email-log", statusFilter],
    queryFn: async () => {
      let q = supabase.from("email_log").select("*").order("sent_at", { ascending: false }).limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set((emails ?? []).map((e: any) => e.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} email log entr${ids.length === 1 ? "y" : "ies"}? This cannot be undone.`)) return;
    const { error } = await supabase.from("email_log").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["email-log"] });
  };

  const retryOne = async (email: any): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: email.to_email,
          to_name: email.to_name || undefined,
          subject: email.subject,
          html: email.body_html || "",
          logged_by: user?.id,
          related_attendee_id: email.related_attendee_id || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || "Failed" };
    }
  };

  const handleRetry = async (email: any) => {
    setRetryingId(email.id);
    const res = await retryOne(email);
    setRetryingId(null);
    if (res.ok) {
      toast.success("Resent");
      qc.invalidateQueries({ queryKey: ["email-log"] });
    } else {
      toast.error("Retry failed: " + res.error);
    }
  };

  const handleBulkRetry = async () => {
    const failed = (emails ?? []).filter((e: any) => selected.has(e.id) && e.status === "failed");
    if (!failed.length) return toast.error("Select failed emails to retry");
    setBulkRetrying(true);
    // throttle at ~4/sec to respect Resend rate limit
    const MIN_INTERVAL = 250;
    let nextSlot = Date.now();
    let ok = 0, fail = 0;
    for (const e of failed) {
      const now = Date.now();
      const wait = Math.max(0, nextSlot - now);
      nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const r = await retryOne(e);
      if (r.ok) ok++; else fail++;
    }
    setBulkRetrying(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["email-log"] });
    if (fail === 0) toast.success(`Resent ${ok}`);
    else toast.warning(`Resent ${ok}, ${fail} still failing`);
  };

  const openSaveAsTemplate = (email: any) => {
    setTplName(email.subject || "");
    setTplSlug((email.subject || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60));
    setTplPlaceholders("first_name");
    setSaveAsTpl(email);
  };

  const handleSaveTemplate = async () => {
    if (!saveAsTpl || !tplName || !tplSlug) return toast.error("Name and slug required");
    setSavingTpl(true);
    const placeholders = tplPlaceholders.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("email_templates").insert({
      slug: tplSlug,
      name: tplName,
      subject: saveAsTpl.subject,
      body_html: saveAsTpl.body_html || "",
      placeholders,
    });
    setSavingTpl(false);
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setSaveAsTpl(null);
  };

  const statusBadge = (s: string) => {
    if (s === "failed") return <Badge variant="destructive">failed</Badge>;
    if (s === "sent") return <Badge>sent</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Sent Emails
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }}>
              <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            {selected.size > 0 && (emails ?? []).some((e: any) => selected.has(e.id) && e.status === "failed") && (
              <Button size="sm" variant="outline" onClick={handleBulkRetry} disabled={bulkRetrying}>
                {bulkRetrying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCw className="h-4 w-4 mr-1" />}
                Retry failed
              </Button>
            )}
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={() => handleDelete([...selected])}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete {selected.size}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : !emails?.length ? (
          <p className="text-muted-foreground text-center py-8">No emails.</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === emails.length}
                      onCheckedChange={(c) => toggleAll(!!c)}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email: any) => (
                  <TableRow key={email.id} className={email.status === "failed" ? "bg-destructive/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(email.id)}
                        onCheckedChange={(c) => toggleOne(email.id, !!c)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {email.sent_at ? format(new Date(email.sent_at), "MMM d, yyyy h:mm a") : "—"}
                    </TableCell>
                    <TableCell>
                      {email.to_name && <span className="font-medium">{email.to_name} </span>}
                      <span className="text-muted-foreground text-sm">{email.to_email}</span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {email.subject}
                      {email.status === "failed" && email.error && (
                        <div className="mt-1 text-xs text-destructive flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{email.error}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(email.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 row-actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(email)}>
                            <Eye className="h-4 w-4 mr-2" /> View
                          </DropdownMenuItem>
                          {email.status === "failed" && (
                            <DropdownMenuItem onClick={() => handleRetry(email)} disabled={retryingId === email.id}>
                              {retryingId === email.id
                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                : <RotateCw className="h-4 w-4 mr-2" />}
                              Retry send
                            </DropdownMenuItem>
                          )}
                          {email.body_html && (
                            <DropdownMenuItem onClick={() => openSaveAsTemplate(email)}>
                              <FileText className="h-4 w-4 mr-2" /> Save as template
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete([email.id])}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>{viewing?.subject}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            To: {viewing?.to_name && `${viewing.to_name} `}&lt;{viewing?.to_email}&gt;
          </div>
          {viewing?.error && (
            <div className="mb-3 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <strong>Error:</strong> {viewing.error}
            </div>
          )}
          {viewing?.body_html ? (
            <div className="prose prose-sm max-w-none border rounded-md p-4" dangerouslySetInnerHTML={{ __html: viewing.body_html }} />
          ) : <p className="text-muted-foreground">No body content</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!saveAsTpl} onOpenChange={(o) => !o && setSaveAsTpl(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save as email template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Template name</Label>
              <Input value={tplName} onChange={(e) => setTplName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Slug (unique)</Label>
              <Input value={tplSlug} onChange={(e) => setTplSlug(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Placeholders (comma-separated)</Label>
              <Input value={tplPlaceholders} onChange={(e) => setTplPlaceholders(e.target.value)} placeholder="first_name, meeting_date" />
              <p className="text-xs text-muted-foreground">
                Wrap parts of the body that should be replaced in <code>{`{{placeholder}}`}</code>. You can edit the template later from the Templates tab.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsTpl(null)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={savingTpl}>{savingTpl ? "Saving..." : "Save template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

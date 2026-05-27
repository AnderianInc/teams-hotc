import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import RichTextEditor from "@/components/comms/RichTextEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send, Sparkles, Loader2, AlertTriangle, Users } from "lucide-react";
import { findRecentDuplicate, type DuplicateHit } from "@/lib/duplicateGuard";
import { formatDistanceToNow } from "date-fns";
import RecipientPicker, { type Recipient } from "@/components/comms/RecipientPicker";

interface EmailComposerProps {
  defaultTo?: string;
  defaultToName?: string;
  defaultSubject?: string;
  defaultBody?: string;
  relatedAttendeeId?: string;
  onSent?: () => void;
}

function renderTemplate(s: string, r: Recipient): string {
  return s
    .replace(/\{\{\s*first_name\s*\}\}/gi, r.firstName || "")
    .replace(/\{\{\s*last_name\s*\}\}/gi, r.lastName || "");
}

export default function EmailComposer({
  defaultTo = "",
  defaultToName = "",
  defaultSubject = "",
  defaultBody = "",
  relatedAttendeeId,
  onSent,
}: EmailComposerProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [to, setTo] = useState(defaultTo);
  const [toName, setToName] = useState(defaultToName);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [duplicateHit, setDuplicateHit] = useState<DuplicateHit | null>(null);
  const [acknowledgedDup, setAcknowledgedDup] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [progress, setProgress] = useState<{ done: number; ok: number; failed: number } | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; kind: string }>>([]);

  useEffect(() => {
    setAcknowledgedDup(false);
    if (mode !== "single" || !to.trim() || !subject.trim()) {
      setDuplicateHit(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const hit = await findRecentDuplicate({
        channel: "email",
        toEmail: to.trim(),
        subject: subject.trim(),
        withinDays: 7,
      });
      if (!cancelled) setDuplicateHit(hit);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [to, subject, mode]);

  const openLoadGroup = async () => {
    const { data } = await supabase.from("contact_groups").select("id, name, kind").order("name");
    setGroups(data ?? []);
    setGroupOpen(true);
  };

  const loadGroup = async (groupId: string) => {
    const { data, error } = await supabase.rpc("resolve_contact_group", { _group_id: groupId });
    if (error) return toast.error(error.message);
    const emailOnly = (data ?? [])
      .filter((r: any) => r.email && !r.do_not_contact)
      .map((r: any) => ({
        key: `${r.source}:${r.source_id}`,
        source: r.source,
        id: r.source_id,
        firstName: r.first_name ?? "",
        lastName: r.last_name ?? "",
        email: r.email,
        phone: r.phone,
        smsOptIn: !!r.sms_opt_in,
        doNotContact: !!r.do_not_contact,
        tags: r.tags ?? [],
      })) as Recipient[];
    setMode("multi");
    setRecipients((prev) => {
      const keys = new Set(prev.map((p) => p.key));
      return [...prev, ...emailOnly.filter((r) => !keys.has(r.key))];
    });
    setGroupOpen(false);
    toast.success(`Loaded ${emailOnly.length} recipients`);
  };

  const handleSendSingle = async () => {
    if (!to || !subject) return toast.error("Recipient email and subject are required");
    if (duplicateHit && !acknowledgedDup) {
      toast.warning("This contact already received an email with this subject recently — confirm below to send anyway");
      setAcknowledgedDup(true);
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to,
          subject,
          html: body,
          logged_by: user?.id,
          to_name: toName || undefined,
          related_attendee_id: relatedAttendeeId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Email sent!");
      setTo(""); setToName(""); setSubject(""); setBody("");
      onSent?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const handleSendMulti = async () => {
    if (recipients.length === 0) return toast.error("Add recipients first");
    if (!subject.trim() || !body.trim()) return toast.error("Subject and body are required");
    setSending(true);
    setProgress({ done: 0, ok: 0, failed: 0 });
    const queue = [...recipients];
    let ok = 0, failed = 0, done = 0;
    const errors: string[] = [];

    // Resend caps sends at ~2/sec (free) up to 10/sec (paid). Stay at 4/sec
    // with exponential backoff on 429 to avoid rate-limit errors.
    const RATE_PER_SEC = 4;
    const MIN_INTERVAL_MS = Math.ceil(1000 / RATE_PER_SEC);
    let nextSlot = Date.now();

    const waitForSlot = async () => {
      const now = Date.now();
      const slot = Math.max(now, nextSlot);
      nextSlot = slot + MIN_INTERVAL_MS;
      const wait = slot - now;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    };

    const sendOne = async (r: Recipient, attempt = 0): Promise<void> => {
      await waitForSlot();
      try {
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: {
            to: r.email,
            to_name: `${r.firstName} ${r.lastName}`.trim() || undefined,
            subject: renderTemplate(subject, r),
            html: renderTemplate(body, r),
            logged_by: user?.id,
            related_attendee_id: r.source === "attendee" ? r.id : undefined,
          },
        });
        const errMsg = error?.message || data?.error || "";
        if (errMsg && /rate|429|too many/i.test(errMsg) && attempt < 4) {
          await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
          return sendOne(r, attempt + 1);
        }
        if (error || data?.error) throw new Error(errMsg);
        ok++;
      } catch (e) {
        const msg = (e as Error).message || "";
        if (/rate|429|too many/i.test(msg) && attempt < 4) {
          await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
          return sendOne(r, attempt + 1);
        }
        failed++;
        errors.push(`${r.firstName} ${r.lastName}: ${msg}`);
      }
      done++;
      setProgress({ done, ok, failed });
    };

    const worker = async () => {
      while (queue.length) {
        const r = queue.shift();
        if (!r || !r.email) continue;
        await sendOne(r);
      }
    };
    await Promise.all(Array.from({ length: RATE_PER_SEC }, worker));
    setSending(false);
    if (failed === 0) {
      toast.success(`Sent ${ok} email${ok === 1 ? "" : "s"}`);
      setRecipients([]); setSubject(""); setBody("");
    } else {
      toast.warning(`Sent ${ok}, failed ${failed}. First: ${errors[0]}`);
    }
    onSent?.();
  };

  const handleAiDraft = async () => {
    if (!aiPrompt.trim()) return toast.error("Enter a prompt for the AI to draft from");
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-draft", {
        body: { prompt: aiPrompt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBody(data.content);
      toast.success("Draft generated!");
    } catch (e: any) {
      toast.error("AI drafting failed: " + (e.message || "Unknown error"));
    } finally {
      setDrafting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Compose Email
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>
            One person
          </Button>
          <Button size="sm" variant={mode === "multi" ? "default" : "outline"} onClick={() => setMode("multi")}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Multiple
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "single" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>To (email)</Label>
              <Input placeholder="email@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Recipient Name (optional)</Label>
              <Input placeholder="John Doe" value={toName} onChange={(e) => setToName(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Recipients</Label>
              <Button size="sm" variant="outline" onClick={openLoadGroup}>Load from group</Button>
            </div>
            <RecipientPicker channel="email" value={recipients} onChange={setRecipients} />
          </div>
        )}
        <div className="space-y-1">
          <Label>Subject</Label>
          <Input placeholder="Email subject..." value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>AI Draft Assistant</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Write a follow-up email to a first-time visitor"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleAiDraft} disabled={drafting}>
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Draft</span>
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label>Email Body</Label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="Write your email content here..."
            minHeight={240}
          />
          {mode === "multi" && (
            <p className="text-[11px] text-muted-foreground">
              Placeholders: <code>{"{{first_name}}"}</code>, <code>{"{{last_name}}"}</code>
            </p>
          )}
        </div>


        {mode === "single" && duplicateHit && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              We sent <strong>{duplicateHit.subject || "an email"}</strong> to this address{" "}
              <strong>{formatDistanceToNow(new Date(duplicateHit.sentAt), { addSuffix: true })}</strong>.
              {acknowledgedDup ? " Click Send again to send anyway." : " Click Send to acknowledge and proceed."}
            </div>
          </div>
        )}

        {progress && (
          <div className="text-xs text-muted-foreground">
            Sent {progress.done}/{recipients.length} · ok {progress.ok} · failed {progress.failed}
          </div>
        )}

        <Button
          onClick={mode === "single" ? handleSendSingle : handleSendMulti}
          disabled={sending}
          className="w-full"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              {mode === "single"
                ? duplicateHit && acknowledgedDup ? "Send anyway" : "Send Email"
                : `Send to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`}
            </>
          )}
        </Button>
      </CardContent>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Load from group</DialogTitle></DialogHeader>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer" onClick={() => loadGroup(g.id)}>
                  <span>{g.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{g.kind}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

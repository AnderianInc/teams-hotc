import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, Zap, AlertTriangle, Users } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { findRecentDuplicate, type DuplicateHit } from "@/lib/duplicateGuard";
import { formatDistanceToNow } from "date-fns";
import { normalizePhone } from "@/lib/phone";
import RecipientPicker, { type Recipient } from "@/components/comms/RecipientPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SmsComposerProps {
  defaultTo?: string;
  defaultToName?: string;
  defaultBody?: string;
  relatedAttendeeId?: string;
  onSent?: () => void;
}

const MAX_CHARS = 1600;

function renderTemplate(body: string, r: Recipient): string {
  return body
    .replace(/\{\{\s*first_name\s*\}\}/gi, r.firstName || "")
    .replace(/\{\{\s*last_name\s*\}\}/gi, r.lastName || "");
}

export default function SmsComposer({
  defaultTo = "",
  defaultToName = "",
  defaultBody = "",
  relatedAttendeeId,
  onSent,
}: SmsComposerProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [to, setTo] = useState(defaultTo);
  const [toName, setToName] = useState(defaultToName);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [overrideConsent, setOverrideConsent] = useState(false);
  const [consentNote, setConsentNote] = useState("");
  const [duplicateHit, setDuplicateHit] = useState<DuplicateHit | null>(null);
  const [acknowledgedDup, setAcknowledgedDup] = useState(false);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [progress, setProgress] = useState<{ done: number; ok: number; failed: number } | null>(null);

  const [groupOpen, setGroupOpen] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; kind: string }>>([]);

  useEffect(() => {
    setAcknowledgedDup(false);
    if (mode !== "single") return;
    const norm = normalizePhone(to);
    if (!norm.valid || !norm.e164 || !body.trim()) {
      setDuplicateHit(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const hit = await findRecentDuplicate({
        channel: "sms",
        toPhone: norm.e164!,
        bodyPrefix: body.trim().slice(0, 60),
        withinDays: 7,
      });
      if (!cancelled) setDuplicateHit(hit);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [to, body, mode]);

  const openLoadGroup = async () => {
    const { data } = await supabase
      .from("contact_groups")
      .select("id, name, kind")
      .order("name");
    setGroups(data ?? []);
    setGroupOpen(true);
  };

  const loadGroup = async (groupId: string) => {
    const { data, error } = await supabase.rpc("resolve_contact_group", { _group_id: groupId });
    if (error) {
      toast.error(error.message);
      return;
    }
    const phoneOnly = (data ?? [])
      .filter((r: any) => r.phone && !r.do_not_contact)
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
      return [...prev, ...phoneOnly.filter((r) => !keys.has(r.key))];
    });
    setGroupOpen(false);
    toast.success(`Loaded ${phoneOnly.length} recipients from group`);
  };

  const handleSendSingle = async () => {
    if (!to.trim()) return toast.error("Recipient phone number is required");
    if (!body.trim()) return toast.error("Message body is required");
    if (duplicateHit && !acknowledgedDup) {
      toast.warning("This contact received a very similar text recently — confirm below to send anyway");
      setAcknowledgedDup(true);
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          to: to.trim(),
          body: body.trim(),
          to_name: toName.trim() || undefined,
          related_attendee_id: relatedAttendeeId || undefined,
          logged_by: user?.id,
          override_consent: overrideConsent || undefined,
          consent_note: overrideConsent ? consentNote.trim() : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Text sent!");
      setTo("");
      setToName("");
      setBody("");
      setOverrideConsent(false);
      setConsentNote("");
      onSent?.();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to send text");
    } finally {
      setSending(false);
    }
  };

  const handleSendMulti = async () => {
    if (recipients.length === 0) return toast.error("Add at least one recipient");
    if (!body.trim()) return toast.error("Message body is required");
    setSending(true);
    setProgress({ done: 0, ok: 0, failed: 0 });

    const queue = [...recipients];
    let ok = 0;
    let failed = 0;
    let done = 0;
    const concurrency = 4;
    const errors: string[] = [];

    const worker = async () => {
      while (queue.length) {
        const r = queue.shift();
        if (!r || !r.phone) continue;
        const personalized = renderTemplate(body.trim(), r);
        try {
          const { data, error } = await supabase.functions.invoke("send-sms", {
            body: {
              to: r.phone,
              body: personalized,
              to_name: `${r.firstName} ${r.lastName}`.trim() || undefined,
              related_attendee_id: r.source === "attendee" ? r.id : undefined,
              logged_by: user?.id,
              override_consent: overrideConsent || undefined,
              consent_note: overrideConsent ? consentNote.trim() : undefined,
            },
          });
          if (error || data?.error) throw new Error(error?.message || data?.error);
          ok++;
        } catch (e) {
          failed++;
          errors.push(`${r.firstName} ${r.lastName}: ${(e as Error).message}`);
        }
        done++;
        setProgress({ done, ok, failed });
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    setSending(false);
    if (failed === 0) {
      toast.success(`Sent ${ok} text${ok === 1 ? "" : "s"}!`);
      setRecipients([]);
      setBody("");
    } else {
      toast.warning(`Sent ${ok}, failed ${failed}. First error: ${errors[0]}`);
    }
    onSent?.();
  };

  const handleQuickTest = async () => {
    if (!user?.id) return toast.error("You must be signed in to send a test");
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!profile?.phone) return toast.error("Add a phone number to your profile first");
    setMode("single");
    setTo(profile.phone);
    setToName(profile.full_name || "Test");
    setBody(`Test from HOTC Volunteer Hub at ${new Date().toLocaleTimeString()} — if you see this, SMS is working ✅`);
    toast.info("Test message ready — click Send Text to deliver");
  };

  const remaining = MAX_CHARS - body.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Send Text Message
        </CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === "single" ? "default" : "outline"}
            onClick={() => setMode("single")}
          >
            One person
          </Button>
          <Button
            size="sm"
            variant={mode === "multi" ? "default" : "outline"}
            onClick={() => setMode("multi")}
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Multiple
          </Button>
          <Button size="sm" variant="outline" onClick={handleQuickTest}>
            <Zap className="h-3.5 w-3.5 mr-1.5" /> Test
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "single" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>To (phone number)</Label>
              <PhoneInput placeholder="(555) 123-4567" value={to} onChange={(v) => setTo(v)} />
            </div>
            <div className="space-y-1">
              <Label>Recipient Name (optional)</Label>
              <Input
                placeholder="John Doe"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Recipients</Label>
              <Button size="sm" variant="outline" onClick={openLoadGroup}>
                Load from group
              </Button>
            </div>
            <RecipientPicker
              channel="sms"
              value={recipients}
              onChange={setRecipients}
              requireOptIn
            />
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>Message</Label>
            <span className={`text-xs ${remaining < 100 ? "text-destructive" : "text-muted-foreground"}`}>
              {remaining} characters remaining
            </span>
          </div>
          <Textarea
            placeholder={
              mode === "multi"
                ? "Use {{first_name}} for personalization…"
                : "Type your message here…"
            }
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
            rows={5}
          />
          {mode === "multi" && (
            <p className="text-[11px] text-muted-foreground">
              Placeholders available: <code>{"{{first_name}}"}</code>, <code>{"{{last_name}}"}</code>
            </p>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer text-xs leading-snug">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={overrideConsent}
              onChange={(e) => setOverrideConsent(e.target.checked)}
            />
            <span>
              I confirm these recipients have given prior opt-in consent to receive SMS from HOTC. See{" "}
              <a href="/sms-policy" target="_blank" rel="noopener" className="text-primary underline">
                SMS terms
              </a>
              .
            </span>
          </label>
          {overrideConsent && (
            <Input
              placeholder="How was consent obtained?"
              value={consentNote}
              onChange={(e) => setConsentNote(e.target.value)}
              className="text-xs"
            />
          )}
        </div>

        {mode === "single" && duplicateHit && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              A very similar text was sent to this number{" "}
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
          disabled={sending || (mode === "single" ? !to.trim() : recipients.length === 0) || !body.trim()}
          className="w-full"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              {mode === "single"
                ? duplicateHit && acknowledgedDup
                  ? "Send anyway"
                  : "Send Text"
                : `Send to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`}
            </>
          )}
        </Button>
      </CardContent>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load recipients from a group</DialogTitle>
          </DialogHeader>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups yet. Create one in the Groups tab.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => loadGroup(g.id)}
                >
                  <span>{g.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">{g.kind}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

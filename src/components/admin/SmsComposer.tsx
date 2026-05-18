import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, Zap, AlertTriangle } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { findRecentDuplicate, type DuplicateHit } from "@/lib/duplicateGuard";
import { formatDistanceToNow } from "date-fns";
import { normalizePhone } from "@/lib/phone";

interface SmsComposerProps {
  defaultTo?: string;
  defaultToName?: string;
  defaultBody?: string;
  relatedAttendeeId?: string;
  onSent?: () => void;
}

const MAX_CHARS = 1600;

export default function SmsComposer({
  defaultTo = "",
  defaultToName = "",
  defaultBody = "",
  relatedAttendeeId,
  onSent,
}: SmsComposerProps) {
  const { user } = useAuth();
  const [to, setTo] = useState(defaultTo);
  const [toName, setToName] = useState(defaultToName);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [overrideConsent, setOverrideConsent] = useState(false);
  const [consentNote, setConsentNote] = useState("");
  const [duplicateHit, setDuplicateHit] = useState<DuplicateHit | null>(null);
  const [acknowledgedDup, setAcknowledgedDup] = useState(false);

  useEffect(() => {
    setAcknowledgedDup(false);
    const norm = normalizePhone(to);
    if (!norm.valid || !norm.e164 || !body.trim()) {
      setDuplicateHit(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const hit = await findRecentDuplicate({
        channel: "sms",
        toPhone: norm.e164,
        bodyPrefix: body.trim().slice(0, 60),
        withinDays: 7,
      });
      if (!cancelled) setDuplicateHit(hit);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [to, body]);

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error("Recipient phone number is required");
      return;
    }
    if (!body.trim()) {
      toast.error("Message body is required");
      return;
    }
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

  const handleQuickTest = async () => {
    // Load the current user's phone from their profile and pre-fill a test message
    if (!user?.id) {
      toast.error("You must be signed in to send a test");
      return;
    }
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!profile?.phone) {
      toast.error("Add a phone number to your profile first");
      return;
    }
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
        <Button size="sm" variant="outline" onClick={handleQuickTest}>
          <Zap className="h-3.5 w-3.5 mr-1.5" /> Quick Test
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>To (phone number)</Label>
            <PhoneInput
              placeholder="(555) 123-4567"
              value={to}
              onChange={(v) => setTo(v)}
            />
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

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>Message</Label>
            <span className={`text-xs ${remaining < 100 ? "text-destructive" : "text-muted-foreground"}`}>
              {remaining} characters remaining
            </span>
          </div>
          <Textarea
            placeholder="Type your message here..."
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
            rows={5}
          />
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
              I confirm this recipient has given prior opt-in consent to receive SMS from HOTC (overrides the
              automatic opt-in check). See{" "}
              <a href="/sms-policy" target="_blank" rel="noopener" className="text-primary underline">SMS terms</a>.
            </span>
          </label>
          {overrideConsent && (
            <Input
              placeholder="How was consent obtained? (e.g. paper Connect Card 5/12, verbal at altar)"
              value={consentNote}
              onChange={(e) => setConsentNote(e.target.value)}
              className="text-xs"
            />
          )}
        </div>

        <Button onClick={handleSend} disabled={sending || !to.trim() || !body.trim()} className="w-full">
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</>
          ) : (
            <><Send className="h-4 w-4 mr-2" /> Send Text</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

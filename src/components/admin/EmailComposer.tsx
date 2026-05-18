import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Send, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { findRecentDuplicate, type DuplicateHit } from "@/lib/duplicateGuard";
import { formatDistanceToNow } from "date-fns";

interface EmailComposerProps {
  defaultTo?: string;
  defaultToName?: string;
  defaultSubject?: string;
  defaultBody?: string;
  relatedAttendeeId?: string;
  onSent?: () => void;
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
  const [to, setTo] = useState(defaultTo);
  const [toName, setToName] = useState(defaultToName);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [duplicateHit, setDuplicateHit] = useState<DuplicateHit | null>(null);
  const [acknowledgedDup, setAcknowledgedDup] = useState(false);

  useEffect(() => {
    setAcknowledgedDup(false);
    if (!to.trim() || !subject.trim()) {
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
  }, [to, subject]);

  const handleSend = async () => {
    if (!to || !subject) {
      toast.error("Recipient email and subject are required");
      return;
    }
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

  const handleAiDraft = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Enter a prompt for the AI to draft from");
      return;
    }
    setDrafting(true);
    try {
      const context = [
        to && `Recipient email: ${to}`,
        toName && `Recipient name: ${toName}`,
        subject && `Subject: ${subject}`,
      ].filter(Boolean).join(", ");
      const { data, error } = await supabase.functions.invoke("ai-draft", {
        body: { prompt: aiPrompt, context: context || undefined },
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Compose Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <div className="space-y-1">
          <Label>Subject</Label>
          <Input placeholder="Email subject..." value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>AI Draft Assistant</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Write a follow-up email to a first-time visitor named Sarah"
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
          <Label>Email Body (HTML)</Label>
          <Textarea
            placeholder="Write your email content here..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
          />
        </div>

        <Button onClick={handleSend} disabled={sending} className="w-full">
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" /> Send Email
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

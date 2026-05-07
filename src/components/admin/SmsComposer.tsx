import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2 } from "lucide-react";

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

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error("Recipient phone number is required");
      return;
    }
    if (!body.trim()) {
      toast.error("Message body is required");
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
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Text sent!");
      setTo("");
      setToName("");
      setBody("");
      onSent?.();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to send text");
    } finally {
      setSending(false);
    }
  };

  const remaining = MAX_CHARS - body.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Send Text Message
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>To (phone number)</Label>
            <Input
              type="tel"
              placeholder="5551234567"
              value={to}
              onChange={(e) => setTo(e.target.value)}
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

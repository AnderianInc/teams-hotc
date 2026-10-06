import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, MessageSquare, Sparkles } from "lucide-react";

const db = supabase as any;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);

function localToIso(v: string | null) {
  if (!v) return null;
  const guess = new Date(v + ":00Z");
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(guess);
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  const asLocal = new Date(`${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}:00Z`);
  return new Date(guess.getTime() - (asLocal.getTime() - guess.getTime())).toISOString();
}

export default function EventAiWizard({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<any>(null);

  const generate = async () => {
    setBusy(true); setDraft(null);
    try {
      const { data, error } = await supabase.functions.invoke("events-ai-wizard", { body: { prompt } });
      if (error) {
        const ctx = await (error as any).context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      setDraft(data.draft);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    try {
      const { custom_questions, ...cfg } = draft.form_config;
      const { data: ev, error } = await db.from("events").insert({
        name: draft.name, description: draft.description, lead_type: draft.lead_type,
        start_at: localToIso(draft.start_at_local), location: draft.location,
        slug: `${slugify(draft.name)}-${Date.now().toString(36).slice(-4)}`, status: "draft",
        form_config: { ...cfg, custom_questions: custom_questions.map((q: any) => ({ ...q, id: crypto.randomUUID() })) },
      }).select().single();
      if (error) throw error;
      let i = 0;
      for (const s of draft.steps) {
        const slug = `event-${slugify(draft.name)}-${slugify(s.name)}-${Date.now().toString(36)}${i}`;
        const tpl = s.channel === "email"
          ? await db.from("email_templates").insert({ slug, name: `${draft.name} – ${s.name}`, subject: s.subject || s.name, body_html: s.body, category: "event" }).select("id").single()
          : await db.from("sms_templates").insert({ slug, name: `${draft.name} – ${s.name}`, body: s.body, category: "event" }).select("id").single();
        if (tpl.error) throw tpl.error;
        await db.from("event_workflow_steps").insert({
          event_id: ev.id, order_index: i++, name: s.name, channel: s.channel, anchor: s.anchor,
          offset_minutes: s.offset_minutes, send_at_local_time: s.send_at_local_time,
          ...(s.channel === "email" ? { email_template_id: tpl.data.id } : { sms_template_id: tpl.data.id }),
        });
      }
      toast.success("Draft event created — review and publish when ready");
      onOpenChange(false); setDraft(null); setPrompt("");
      onCreated(ev.id);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI event wizard</DialogTitle>
          <DialogDescription>Describe the event. AI drafts the page, form, follow-up steps and messages — you review before anything is saved.</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Worship Night on Friday Nov 14 at 7pm in the main hall. Send a confirmation, a reminder the day before, and a thank-you text after." />
        {draft && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="font-semibold">{draft.name} <Badge variant="secondary">{draft.lead_type}</Badge></div>
            <div className="text-muted-foreground">{draft.description}</div>
            <div className="text-xs">{draft.start_at_local || "No date"} · {draft.location || "No location"}</div>
            <div className="space-y-2 pt-2">
              {draft.steps.map((s: any, i: number) => (
                <div key={i} className="rounded bg-muted/40 p-2">
                  <div className="flex items-center gap-1 font-medium">{s.channel === "email" ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}{s.name}
                    <span className="text-xs text-muted-foreground ml-1">({s.anchor === "signup" ? "after signup" : s.offset_minutes < 0 ? "before event" : "after event"}, {Math.abs(s.offset_minutes)} min)</span></div>
                  {s.subject && <div className="text-xs font-semibold">{s.subject}</div>}
                  <div className="text-xs whitespace-pre-wrap">{s.body.replace(/<br\s*\/?>/gi, "\n")}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={generate} disabled={busy || prompt.trim().length < 5}>{busy && !draft ? "Drafting…" : draft ? "Regenerate" : "Draft it"}</Button>
          {draft && <Button onClick={create} disabled={busy}>Create draft event</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

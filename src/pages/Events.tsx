import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Copy, ExternalLink, Mail, MessageSquare, Plus, Sparkles, Trash2, UserCheck, Zap } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseUserAgent, referrerSource } from "@/lib/clientInfo";
import EventAiWizard from "@/components/events/EventAiWizard";
import type { FormConfig } from "./EventRegistration";

const TZ = "America/Los_Angeles";
const db = supabase as any;

type Ev = {
  id: string; slug: string; name: string; description: string | null; lead_type: string; status: string;
  start_at: string | null; location: string | null; form_config: FormConfig; is_template: boolean;
};
type Step = {
  id: string; event_id: string; order_index: number; name: string; channel: "email" | "sms";
  email_template_id: string | null; sms_template_id: string | null; anchor: "signup" | "event_start";
  offset_minutes: number; send_at_local_time: string | null; requires_approval: boolean; active: boolean;
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
const fmt = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "No date";

// datetime-local <-> ISO in church time
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}
function fromLocalInput(v: string) {
  if (!v) return null;
  const guess = new Date(v + ":00Z");
  const local = toLocalInput(guess.toISOString());
  const diff = new Date(local + ":00Z").getTime() - guess.getTime();
  return new Date(guess.getTime() - diff).toISOString();
}

export function describeTiming(s: Pick<Step, "anchor" | "offset_minutes" | "send_at_local_time">) {
  const m = Math.abs(s.offset_minutes);
  const amt = m === 0 ? "" : m % 1440 === 0 ? `${m / 1440} day${m / 1440 > 1 ? "s" : ""}` : m % 60 === 0 ? `${m / 60} hour${m / 60 > 1 ? "s" : ""}` : `${m} min`;
  const at = s.send_at_local_time ? ` at ${s.send_at_local_time.slice(0, 5)}` : "";
  if (s.anchor === "signup") return m === 0 ? "Immediately after signup" : `${amt} after signup${at}`;
  if (m === 0) return `At event start${at}`;
  return `${amt} ${s.offset_minutes < 0 ? "before" : "after"} the event${at}`;
}

export default function Events() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const { data: events = [] } = useQuery({
    queryKey: ["events-admin"],
    queryFn: async () => {
      const { data, error } = await db.from("events").select("*").order("start_at", { ascending: false, nullsFirst: true });
      if (error) throw error;
      return data as Ev[];
    },
  });
  const { data: counts = {} } = useQuery({
    queryKey: ["events-reg-counts"],
    queryFn: async () => {
      const { data } = await db.from("funnel_leads").select("event_id").not("event_id", "is", null);
      const c: Record<string, number> = {};
      (data || []).forEach((r: any) => (c[r.event_id] = (c[r.event_id] || 0) + 1));
      return c;
    },
  });

  const createBlank = async (fromTemplate?: Ev) => {
    const name = fromTemplate ? `${fromTemplate.name} (copy)` : "New event";
    const { data, error } = await db.from("events").insert({
      name, slug: `${slugify(name)}-${Date.now().toString(36)}`,
      lead_type: fromTemplate?.lead_type || "general", description: fromTemplate?.description,
      location: fromTemplate?.location, form_config: fromTemplate?.form_config || { show_sms_consent: true, show_message: true, require_email: true },
    }).select().single();
    if (error) return toast.error(error.message);
    if (fromTemplate) {
      const { data: steps } = await db.from("event_workflow_steps").select("*").eq("event_id", fromTemplate.id);
      if (steps?.length) await db.from("event_workflow_steps").insert(steps.map(({ id, created_at, updated_at, ...s }: any) => ({ ...s, event_id: data.id })));
    }
    qc.invalidateQueries({ queryKey: ["events-admin"] });
    setOpenId(data.id);
  };

  if (openId) return <EventEditor id={openId} onBack={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["events-admin"] }); }} />;

  const real = events.filter((e) => !e.is_template);
  const templates = events.filter((e) => e.is_template);
  const now = Date.now();
  const groups: [string, Ev[]][] = [
    ["Upcoming", real.filter((e) => e.status === "published" && (!e.start_at || new Date(e.start_at).getTime() >= now))],
    ["Drafts", real.filter((e) => e.status === "draft")],
    ["Past & archived", real.filter((e) => e.status === "archived" || (e.status === "published" && e.start_at && new Date(e.start_at).getTime() < now))],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary"><CalendarDays className="h-5 w-5 text-primary-foreground" /></div>
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">Events</h1>
            <p className="text-muted-foreground">Plan events, registration pages and follow-up automations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setWizard(true)}><Sparkles className="h-4 w-4 mr-1" /> AI Wizard</Button>
          <Button onClick={() => createBlank()}><Plus className="h-4 w-4 mr-1" /> Create event</Button>
        </div>
      </div>

      {groups.map(([label, list]) => (
        <div key={label} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
          {list.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here.</p> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((e) => (
                <Card key={e.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setOpenId(e.id)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{e.name}</CardTitle>
                      <Badge variant={e.status === "published" ? "default" : "secondary"}>{e.status}</Badge>
                    </div>
                    <CardDescription>{fmt(e.start_at)}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground flex justify-between">
                    <span>{counts[e.id] || 0} registered</span>
                    <span>{e.slug === "interest-meeting" ? "/interest-meeting" : `/e/${e.slug}`}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}

      <SourceMappings events={real} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Event templates</h2>
        {templates.length === 0 ? <p className="text-sm text-muted-foreground">Save any event as a template from its Publish tab.</p> : (
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1 rounded-md border px-2 py-1">
                <span className="text-sm">{t.name}</span>
                <Button size="sm" variant="ghost" onClick={() => createBlank(t)}><Copy className="h-3 w-3 mr-1" />Use</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpenId(t.id)}>Edit</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <EventAiWizard open={wizard} onOpenChange={setWizard} onCreated={(id) => { qc.invalidateQueries({ queryKey: ["events-admin"] }); setOpenId(id); }} />
    </div>
  );
}

function EventEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: ev, refetch } = useQuery({
    queryKey: ["event", id],
    queryFn: async () => (await db.from("events").select("*").eq("id", id).single()).data as Ev,
  });
  const [draft, setDraft] = useState<Partial<Ev> | null>(null);
  const e = { ...(ev || {}), ...(draft || {}) } as Ev;
  const set = (patch: Partial<Ev>) => setDraft((d) => ({ ...(d || {}), ...patch }));
  const setCfg = (patch: Partial<FormConfig>) => set({ form_config: { ...(e.form_config || {}), ...patch } });

  const save = async (extra: Partial<Ev> = {}) => {
    const { id: _i, ...rest } = { ...e, ...extra } as any;
    delete rest.created_at; delete rest.updated_at;
    rest.slug = slugify(rest.slug || rest.name);
    const { error } = await db.from("events").update(rest).eq("id", id);
    if (error) return toast.error(error.message.includes("duplicate") ? "That link is already used by another event." : error.message);
    setDraft(null); await refetch(); toast.success("Saved");
  };

  if (!ev) return <p className="text-muted-foreground">Loading…</p>;
  const publicUrl = ev.slug === "interest-meeting" ? `${window.location.origin}/interest-meeting` : `${window.location.origin}/e/${ev.slug}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> All events</Button>
        <div className="flex gap-2 items-center">
          <Badge variant={ev.status === "published" ? "default" : "secondary"}>{ev.is_template ? "template" : ev.status}</Badge>
          {draft && <Button onClick={() => save()}>Save changes</Button>}
        </div>
      </div>
      <h1 className="text-2xl font-display font-bold">{e.name}</h1>
      <Tabs defaultValue="details">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="details">1. Details</TabsTrigger>
          <TabsTrigger value="form">2. Registration form</TabsTrigger>
          <TabsTrigger value="workflow">3. Follow-up workflow</TabsTrigger>
          <TabsTrigger value="publish">4. Publish</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card><CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Event name</Label><Input value={e.name} onChange={(x) => set({ name: x.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Description (shown on the page)</Label><Textarea rows={3} value={e.description || ""} onChange={(x) => set({ description: x.target.value })} /></div>
            <div className="space-y-2"><Label>Date & time (Pacific)</Label><Input type="datetime-local" value={toLocalInput(e.start_at)} onChange={(x) => set({ start_at: fromLocalInput(x.target.value) })} /></div>
            <div className="space-y-2"><Label>Location</Label><Input value={e.location || ""} onChange={(x) => set({ location: x.target.value })} placeholder="e.g. Brenden Theatres Concord, 1985 Willow Pass Rd" /></div>
            <div className="space-y-2"><Label>Public link</Label>
              <div className="flex items-center gap-1"><span className="text-sm text-muted-foreground">{ev.slug === "interest-meeting" ? "/" : "/e/"}</span>
                <Input value={e.slug} disabled={ev.slug === "interest-meeting"} onChange={(x) => set({ slug: slugify(x.target.value) })} /></div>
            </div>
            <div className="space-y-2"><Label>Registrants are</Label>
              <Select value={e.lead_type} onValueChange={(v) => set({ lead_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General attendees</SelectItem>
                  <SelectItem value="visit">Sunday visitors (become first-timers)</SelectItem>
                  <SelectItem value="interest">Volunteer interest (enter onboarding)</SelectItem>
                  <SelectItem value="prayer">Prayer requests</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="form">
          <Card><CardContent className="pt-6 space-y-3">
            <p className="text-sm text-muted-foreground">First name is always asked. Choose what else to collect.</p>
            {([
              ["require_last_name", "Last name required"], ["require_email", "Email required"], ["require_phone", "Phone required"],
              ["show_team_picker", "Ask which volunteer teams interest them"], ["show_message", "Show a questions / message box"],
              ["show_sms_consent", "Offer text-message reminders (consent checkbox)"],
            ] as [keyof FormConfig, string][]).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm">{label}</span>
                <Switch checked={!!e.form_config?.[k]} onCheckedChange={(v) => setCfg({ [k]: v } as any)} />
              </div>
            ))}
            <div className="space-y-2 pt-2">
              <Label>Custom questions</Label>
              {(e.form_config?.custom_questions || []).map((q, i) => (
                <div key={q.id} className="flex gap-2 items-center">
                  <Input value={q.label} onChange={(x) => {
                    const list = [...(e.form_config.custom_questions || [])]; list[i] = { ...q, label: x.target.value }; setCfg({ custom_questions: list });
                  }} />
                  <label className="text-xs flex items-center gap-1 whitespace-nowrap"><Switch checked={!!q.required} onCheckedChange={(v) => {
                    const list = [...(e.form_config.custom_questions || [])]; list[i] = { ...q, required: v }; setCfg({ custom_questions: list });
                  }} />Required</label>
                  <Button size="icon" variant="ghost" onClick={() => setCfg({ custom_questions: (e.form_config.custom_questions || []).filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setCfg({ custom_questions: [...(e.form_config?.custom_questions || []), { id: crypto.randomUUID(), label: "New question" }] })}><Plus className="h-4 w-4 mr-1" />Add question</Button>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="workflow"><WorkflowBuilder eventId={id} /></TabsContent>

        <TabsContent value="publish">
          <Card><CardContent className="pt-6 space-y-4">
            {!ev.is_template && (
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={publicUrl} className="max-w-md" />
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copied"); }}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" asChild><a href={publicUrl} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4" /></a></Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!ev.is_template && ev.status !== "published" && <Button onClick={() => save({ status: "published" })}>Publish event</Button>}
              {!ev.is_template && ev.status === "published" && <Button variant="outline" onClick={() => save({ status: "draft" })}>Unpublish</Button>}
              {!ev.is_template && ev.status !== "archived" && <Button variant="outline" onClick={() => save({ status: "archived" })}>Archive</Button>}
              {!ev.is_template && <Button variant="outline" onClick={async () => {
                const { id: _x, created_at, updated_at, ...rest } = ev as any;
                const { data, error } = await db.from("events").insert({ ...rest, name: `${ev.name} template`, slug: `tpl-${ev.slug}-${Date.now().toString(36)}`, status: "draft", is_template: true, start_at: null }).select().single();
                if (error) return toast.error(error.message);
                const { data: steps } = await db.from("event_workflow_steps").select("*").eq("event_id", id);
                if (steps?.length) await db.from("event_workflow_steps").insert(steps.map(({ id: _s, created_at: _c, updated_at: _u, ...s }: any) => ({ ...s, event_id: data.id })));
                qc.invalidateQueries({ queryKey: ["events-admin"] });
                toast.success("Saved as event template");
              }}>Save as event template</Button>}
              {ev.slug !== "interest-meeting" && <Button variant="destructive" onClick={async () => {
                if (!confirm("Delete this event? Registrations are kept.")) return;
                await db.from("events").delete().eq("id", id); onBack();
              }}>Delete</Button>}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="registrations"><Registrations eventId={id} /></TabsContent>
        <TabsContent value="messages"><EventMessages eventId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function useTemplates() {
  return useQuery({
    queryKey: ["all-templates-for-events"],
    queryFn: async () => {
      const [{ data: email }, { data: sms }] = await Promise.all([
        db.from("email_templates").select("id, name, subject, body_html").order("name"),
        db.from("sms_templates").select("id, name, body").order("name"),
      ]);
      return { email: email || [], sms: sms || [] } as { email: any[]; sms: any[] };
    },
  });
}

function WorkflowBuilder({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const { data: tpls = { email: [], sms: [] } } = useTemplates();
  const [newTpl, setNewTpl] = useState<{ id?: string; step: Step; name: string; subject: string; body: string } | null>(null);
  const { data: steps = [], refetch } = useQuery({
    queryKey: ["event-steps", eventId],
    queryFn: async () => ((await db.from("event_workflow_steps").select("*").eq("event_id", eventId).order("order_index")).data || []) as Step[],
  });
  const patch = async (s: Step, p: Partial<Step>) => { await db.from("event_workflow_steps").update(p).eq("id", s.id); refetch(); };
  const add = async (channel: "email" | "sms") => {
    await db.from("event_workflow_steps").insert({ event_id: eventId, channel, order_index: steps.length, name: channel === "email" ? "Email" : "Text" });
    refetch();
  };
  const move = async (i: number, d: number) => {
    const a = steps[i], b = steps[i + d]; if (!b) return;
    await Promise.all([patch(a, { order_index: b.order_index }), db.from("event_workflow_steps").update({ order_index: a.order_index }).eq("id", b.id)]);
    refetch();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Each step sends a Comms template. Edit wording in Communications → Templates, or create one here.</p>
      <div className="flex justify-center"><Badge variant="outline" className="py-1"><Zap className="h-3 w-3 mr-1" />Trigger: someone registers</Badge></div>
      {steps.map((s, i) => {
        const unit = s.offset_minutes !== 0 && Math.abs(s.offset_minutes) % 1440 === 0 ? 1440 : Math.abs(s.offset_minutes) % 60 === 0 && s.offset_minutes !== 0 ? 60 : s.offset_minutes === 0 ? 1440 : 1;
        const amount = Math.abs(s.offset_minutes) / unit;
        const dir = s.offset_minutes < 0 ? -1 : 1;
        const list = s.channel === "email" ? tpls.email : tpls.sms;
        const tplId = s.channel === "email" ? s.email_template_id : s.sms_template_id;
        const tpl = list.find((t) => t.id === tplId);
        return (
          <div key={s.id} className="space-y-3">
            <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-muted-foreground" /></div>
            <Card className={s.active ? "" : "opacity-60"}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {s.channel === "email" ? <Mail className="h-4 w-4 text-primary" /> : <MessageSquare className="h-4 w-4 text-primary" />}
                  <Input className="h-8 max-w-xs" defaultValue={s.name} onBlur={(x) => x.target.value !== s.name && patch(s, { name: x.target.value })} />
                  <span className="text-xs text-muted-foreground">{describeTiming(s)}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                    <Switch checked={s.active} onCheckedChange={(v) => patch(s, { active: v })} />
                    <Button size="icon" variant="ghost" onClick={async () => { await db.from("event_workflow_steps").delete().eq("id", s.id); refetch(); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[80px_110px_110px_1fr_120px] items-center">
                  <Input type="number" min={0} value={amount} onChange={(x) => patch(s, { offset_minutes: dir * Math.max(0, +x.target.value) * unit })} />
                  <Select value={String(unit)} onValueChange={(v) => patch(s, { offset_minutes: dir * amount * +v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">minutes</SelectItem><SelectItem value="60">hours</SelectItem><SelectItem value="1440">days</SelectItem></SelectContent>
                  </Select>
                  <Select value={s.anchor === "signup" ? "after-signup" : dir < 0 ? "before-event" : "after-event"} onValueChange={(v) => {
                    const m = Math.abs(s.offset_minutes);
                    patch(s, v === "after-signup" ? { anchor: "signup", offset_minutes: m } : { anchor: "event_start", offset_minutes: v === "before-event" ? -m : m });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="after-signup">after signup</SelectItem>
                      <SelectItem value="before-event">before event</SelectItem>
                      <SelectItem value="after-event">after event</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">Optional send time (Pacific):</span>
                  <Input type="time" value={s.send_at_local_time?.slice(0, 5) || ""} onChange={(x) => patch(s, { send_at_local_time: x.target.value || null })} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={tplId || ""} onValueChange={(v) => {
                    if (v === "__new") return setNewTpl({ step: s, name: `${s.name}`, subject: "", body: "" });
                    patch(s, s.channel === "email" ? { email_template_id: v } : { sms_template_id: v });
                  }}>
                    <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose a template…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new">+ Create a new template</SelectItem>
                      {list.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={s.requires_approval} onCheckedChange={(v) => patch(s, { requires_approval: v })} />Hold for review</label>
                </div>
                {tpl ? (
                  <div className="rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap max-h-28 overflow-auto">
                    {s.channel === "email" && <div className="font-semibold mb-1">{tpl.subject}</div>}
                    {(tpl.body_html || tpl.body || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")}
                  </div>
                ) : null}
                {tpl && <Button size="sm" variant="outline" onClick={() => setNewTpl({ id: tpl.id, step: s, name: tpl.name, subject: tpl.subject || "", body: (tpl.body_html || tpl.body || "").replace(/<br\s*\/?>/gi, "\n") })}>Edit wording</Button>}
                {!tpl && <p className="text-xs text-destructive">No template chosen — this step won't send.</p>}
              </CardContent>
            </Card>
          </div>
        );
      })}
      <div className="flex justify-center gap-2 pt-2">
        <Button variant="outline" onClick={() => add("email")}><Mail className="h-4 w-4 mr-1" />Add email step</Button>
        <Button variant="outline" onClick={() => add("sms")}><MessageSquare className="h-4 w-4 mr-1" />Add text step</Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">Placeholders: {"{{first_name}} {{event_name}} {{date}} {{time}} {{when}} {{where}} {{teams}}"}</p>

      <Dialog open={!!newTpl} onOpenChange={(o) => !o && setNewTpl(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{newTpl?.id ? "Edit" : "New"} {newTpl?.step.channel === "email" ? "email" : "text"} template</DialogTitle></DialogHeader>
          {newTpl && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Template name</Label><Input value={newTpl.name} onChange={(x) => setNewTpl({ ...newTpl, name: x.target.value })} /></div>
              {newTpl.step.channel === "email" && <div className="space-y-1"><Label>Subject</Label><Input value={newTpl.subject} onChange={(x) => setNewTpl({ ...newTpl, subject: x.target.value })} /></div>}
              <div className="space-y-1"><Label>Message</Label><Textarea rows={6} value={newTpl.body} onChange={(x) => setNewTpl({ ...newTpl, body: x.target.value })} placeholder="Hi {{first_name}}, …" /></div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={async () => {
              if (!newTpl) return;
              const isEmail = newTpl.step.channel === "email";
              if (newTpl.id) {
                const { error } = isEmail
                  ? await db.from("email_templates").update({ name: newTpl.name, subject: newTpl.subject || newTpl.name, body_html: newTpl.body.replace(/\n/g, "<br/>"), updated_at: new Date().toISOString() }).eq("id", newTpl.id)
                  : await db.from("sms_templates").update({ name: newTpl.name, body: newTpl.body, updated_at: new Date().toISOString() }).eq("id", newTpl.id);
                if (error) return toast.error(error.message);
                qc.invalidateQueries({ queryKey: ["all-templates-for-events"] });
                toast.success("Template saved — also updated in Communications → Templates");
                return setNewTpl(null);
              }
              const slug = `event-${slugify(newTpl.name)}-${Date.now().toString(36)}`;
              const { data, error } = isEmail
                ? await db.from("email_templates").insert({ slug, name: newTpl.name, subject: newTpl.subject || newTpl.name, body_html: newTpl.body.replace(/\n/g, "<br/>"), category: "event" }).select().single()
                : await db.from("sms_templates").insert({ slug, name: newTpl.name, body: newTpl.body, category: "event" }).select().single();
              if (error) return toast.error(error.message);
              await patch(newTpl.step, isEmail ? { email_template_id: data.id } : { sms_template_id: data.id });
              qc.invalidateQueries({ queryKey: ["all-templates-for-events"] });
              setNewTpl(null);
            }}>{newTpl?.id ? "Save" : "Create & use"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function sourceOf(l: any) {
  const ci = l.client_info || {};
  const ua = ci.user_agent ? parseUserAgent(ci.user_agent) : { device: "", os: "", browser: "", in_app: "" };
  return {
    origin: l.utm_source ? `${l.utm_source}${l.utm_medium ? ` / ${l.utm_medium}` : ""}` : referrerSource(ci.referrer || "", null) + (ci.referrer ? "" : l.client_info?.user_agent ? "" : ""),
    campaign: [l.utm_campaign, l.utm_content, l.utm_term].filter(Boolean).join(" · "),
    device: [ci.device || ua.device, ci.os || ua.os].filter(Boolean).join(" · "),
    browser: ci.browser || ua.browser,
    social: ci.in_app || ua.in_app,
    referrer: ci.referrer || "",
  };
}

function Registrations({ eventId }: { eventId: string }) {
  const [editing, setEditing] = useState<any | null>(null);
  const { data: leads = [], refetch } = useQuery({
    queryKey: ["event-leads", eventId],
    queryFn: async () => ((await db.from("funnel_leads").select("*").eq("event_id", eventId).order("created_at", { ascending: false })).data || []),
  });
  const markAttended = async (id: string) => {
    const { error } = await db.rpc("promote_funnel_lead", { _lead_id: id });
    if (error) return toast.error(error.message);
    toast.success("Added to the Church Directory"); refetch();
  };
  const save = async () => {
    const e = editing;
    const { error } = await db.from("funnel_leads").update({
      first_name: e.first_name, last_name: e.last_name, email: e.email || null, phone: e.phone || null,
      message: e.message || null, notes: e.notes || null, status: e.status, sms_opt_in: e.sms_opt_in,
      tags: String(e.tagsText || "").split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean),
      custom_answers: e.custom_answers || {},
    }).eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("Registration updated"); setEditing(null); refetch();
  };
  if (!leads.length) return <p className="text-sm text-muted-foreground py-6">No registrations yet.</p>;
  const answerKeys = Array.from(new Set(leads.flatMap((l: any) => Object.keys(l.custom_answers || {})))) as string[];
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Texts</TableHead>
          <TableHead>Status</TableHead><TableHead>Registered</TableHead><TableHead>Source</TableHead><TableHead>Campaign</TableHead>
          <TableHead>Device</TableHead><TableHead>Browser / App</TableHead><TableHead>Referrer</TableHead>
          {answerKeys.map((k) => <TableHead key={k}>{k}</TableHead>)}
          <TableHead>Message</TableHead><TableHead>Notes</TableHead><TableHead>Tags</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {leads.map((l: any) => { const s = sourceOf(l); return (
            <TableRow key={l.id} className="text-xs align-top">
              <TableCell className="font-medium whitespace-nowrap">{l.first_name} {l.last_name}</TableCell>
              <TableCell>{l.email || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{l.phone || "—"}</TableCell>
              <TableCell>{l.sms_opt_in ? "Yes" : "No"}</TableCell>
              <TableCell><Badge variant="secondary">{l.status}</Badge>{l.attendee_id && <Badge className="ml-1">In directory</Badge>}</TableCell>
              <TableCell className="whitespace-nowrap">{fmt(l.created_at)}</TableCell>
              <TableCell>{s.origin || "Unknown"}</TableCell>
              <TableCell>{s.campaign || "—"}</TableCell>
              <TableCell>{s.device || "Unknown"}</TableCell>
              <TableCell>{s.browser || "—"}{s.social ? ` (${s.social})` : ""}</TableCell>
              <TableCell className="max-w-[180px] truncate" title={s.referrer}>{s.referrer || "Direct"}</TableCell>
              {answerKeys.map((k) => <TableCell key={k}>{String(l.custom_answers?.[k] ?? "—")}</TableCell>)}
              <TableCell className="max-w-[200px]">{l.message || "—"}</TableCell>
              <TableCell className="max-w-[200px]">{l.notes || "—"}</TableCell>
              <TableCell>{(l.tags || []).map((t: string) => <Badge key={t} variant="outline" className="text-[10px] mr-1 mb-1">{t}</Badge>)}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ ...l, tagsText: (l.tags || []).join(", ") })}>Edit</Button>
                {!l.attendee_id && <Button size="sm" variant="outline" onClick={() => markAttended(l.id)}><UserCheck className="h-4 w-4 mr-1" />Attended</Button>}
              </TableCell>
            </TableRow>); })}
        </TableBody>
      </Table>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit registration</DialogTitle></DialogHeader>
          {editing && <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>First name</Label><Input value={editing.first_name || ""} onChange={(x) => setEditing({ ...editing, first_name: x.target.value })} /></div>
              <div><Label>Last name</Label><Input value={editing.last_name || ""} onChange={(x) => setEditing({ ...editing, last_name: x.target.value })} /></div>
            </div>
            <div><Label>Email</Label><Input value={editing.email || ""} onChange={(x) => setEditing({ ...editing, email: x.target.value })} /></div>
            <div><Label>Phone</Label><Input value={editing.phone || ""} onChange={(x) => setEditing({ ...editing, phone: x.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={!!editing.sms_opt_in} onCheckedChange={(v) => setEditing({ ...editing, sms_opt_in: v })} /><Label>OK to text</Label></div>
            <div><Label>Status</Label>
              <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["planned", "contacted", "confirmed", "attended", "no_show", "cancelled"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {Object.keys(editing.custom_answers || {}).map((k) => (
              <div key={k}><Label>{k}</Label><Input value={String(editing.custom_answers[k] ?? "")} onChange={(x) => setEditing({ ...editing, custom_answers: { ...editing.custom_answers, [k]: x.target.value } })} /></div>
            ))}
            <div><Label>Message</Label><Textarea value={editing.message || ""} onChange={(x) => setEditing({ ...editing, message: x.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={editing.notes || ""} onChange={(x) => setEditing({ ...editing, notes: x.target.value })} /></div>
            <div><Label>Tags (comma separated)</Label><Input value={editing.tagsText} onChange={(x) => setEditing({ ...editing, tagsText: x.target.value })} /></div>
          </div>}
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Close</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventMessages({ eventId }: { eventId: string }) {
  const [editing, setEditing] = useState<any | null>(null);
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["event-messages", eventId],
    queryFn: async () => ((await db.from("funnel_messages").select("*, funnel_leads(first_name,last_name)").eq("event_id", eventId).order("scheduled_for")).data || []),
  });
  const update = async (id: string, patch: Record<string, unknown>, msg: string) => {
    const { data, error } = await db.from("funnel_messages").update(patch).eq("id", id).select("id");
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("You don't have permission to change this message.");
    toast.success(msg); refetch();
  };
  const saveEdit = async () => {
    await update(editing.id, { scheduled_for: new Date(editing.when).toISOString(), recipient: editing.recipient }, "Message updated");
    setEditing(null);
  };
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6">No messages scheduled yet.</p>;
  const open = (s: string) => s === "review" || s === "pending" || s === "failed";
  const toLocal = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Type</TableHead><TableHead>Step</TableHead><TableHead>To</TableHead><TableHead>Recipient</TableHead>
          <TableHead>Scheduled</TableHead><TableHead>Sent</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r: any) => (
            <TableRow key={r.id} className="text-xs">
              <TableCell>{r.channel === "email" ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}</TableCell>
              <TableCell className="font-medium">{r.step}</TableCell>
              <TableCell>{r.funnel_leads?.first_name} {r.funnel_leads?.last_name}</TableCell>
              <TableCell>{r.recipient}</TableCell>
              <TableCell className="whitespace-nowrap">{fmt(r.scheduled_for)}</TableCell>
              <TableCell className="whitespace-nowrap">{r.sent_at ? fmt(r.sent_at) : "—"}</TableCell>
              <TableCell><Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
              <TableCell className="text-destructive max-w-[200px]">{r.error || ""}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {r.status === "review" && <Button size="sm" onClick={() => update(r.id, { status: "pending" }, "Approved")}>Approve</Button>}
                {(r.status === "cancelled" || r.status === "failed") && <Button size="sm" variant="outline" onClick={() => update(r.id, { status: "pending", error: null }, "Re-queued")}>Re-queue</Button>}
                {open(r.status) && <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r, when: toLocal(r.scheduled_for) })}>Edit</Button>}
                {(r.status === "review" || r.status === "pending") && <Button size="sm" variant="ghost" onClick={() => update(r.id, { status: "cancelled" }, "Message cancelled")}>Cancel</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit scheduled message</DialogTitle></DialogHeader>
          {editing && <div className="grid gap-3">
            <div><Label>Send to</Label><Input value={editing.recipient} onChange={(x) => setEditing({ ...editing, recipient: x.target.value })} /></div>
            <div><Label>Send at</Label><Input type="datetime-local" value={editing.when} onChange={(x) => setEditing({ ...editing, when: x.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Wording comes from the step's template — use "Edit wording" in the Follow-up workflow tab.</p>
          </div>}
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Close</Button><Button onClick={saveEdit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceMappings({ events }: { events: Ev[] }) {
  const { data: maps = [], refetch } = useQuery({
    queryKey: ["source-mappings"],
    queryFn: async () => ((await db.from("external_source_mappings").select("*")).data || []) as { source_key: string; event_id: string | null }[],
  });
  const labels: Record<string, string> = { visit: "Visit requests", interest: "Interest meeting requests", prayer: "Prayer requests" };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">hotc.life website requests</CardTitle>
        <CardDescription>Requests sync every hour. Choose which event's follow-up workflow each kind of request joins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {["visit", "interest", "prayer"].map((k) => {
          const m = maps.find((x) => x.source_key === k);
          return (
            <div key={k} className="flex flex-wrap items-center gap-2">
              <span className="text-sm w-56">{labels[k]}</span>
              <Select value={m?.event_id || "none"} onValueChange={async (v) => {
                await db.from("external_source_mappings").upsert({ source_key: k, event_id: v === "none" ? null : v, updated_at: new Date().toISOString() });
                refetch(); toast.success("Saved");
              }}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No automated follow-up</SelectItem>
                  {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

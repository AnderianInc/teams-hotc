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
                    <span>/e/{e.slug}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}

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
            <div className="space-y-2"><Label>Location</Label><Input value={e.location || ""} onChange={(x) => set({ location: x.target.value })} placeholder="House of Transformation Church" /></div>
            <div className="space-y-2"><Label>Public link</Label>
              <div className="flex items-center gap-1"><span className="text-sm text-muted-foreground">/e/</span>
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
  const [newTpl, setNewTpl] = useState<{ step: Step; name: string; subject: string; body: string } | null>(null);
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
                ) : <p className="text-xs text-destructive">No template chosen — this step won't send.</p>}
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
          <DialogHeader><DialogTitle>New {newTpl?.step.channel === "email" ? "email" : "text"} template</DialogTitle></DialogHeader>
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
              const slug = `event-${slugify(newTpl.name)}-${Date.now().toString(36)}`;
              const { data, error } = isEmail
                ? await db.from("email_templates").insert({ slug, name: newTpl.name, subject: newTpl.subject || newTpl.name, body_html: newTpl.body.replace(/\n/g, "<br/>"), category: "event" }).select().single()
                : await db.from("sms_templates").insert({ slug, name: newTpl.name, body: newTpl.body, category: "event" }).select().single();
              if (error) return toast.error(error.message);
              await patch(newTpl.step, isEmail ? { email_template_id: data.id } : { sms_template_id: data.id });
              qc.invalidateQueries({ queryKey: ["all-templates-for-events"] });
              setNewTpl(null);
            }}>Create & use</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Registrations({ eventId }: { eventId: string }) {
  const [tagInput, setTagInput] = useState<Record<string, string>>({});
  const { data: leads = [], refetch } = useQuery({
    queryKey: ["event-leads", eventId],
    queryFn: async () => ((await db.from("funnel_leads").select("*").eq("event_id", eventId).order("created_at", { ascending: false })).data || []),
  });
  const markAttended = async (id: string) => {
    const { error } = await db.rpc("promote_funnel_lead", { _lead_id: id });
    if (error) return toast.error(error.message);
    toast.success("Added to the Church Directory"); refetch();
  };
  const addTag = async (l: any) => {
    const t = (tagInput[l.id] || "").trim().toLowerCase(); if (!t) return;
    await db.from("funnel_leads").update({ tags: Array.from(new Set([...(l.tags || []), t])) }).eq("id", l.id);
    setTagInput((p) => ({ ...p, [l.id]: "" })); refetch();
  };
  if (!leads.length) return <p className="text-sm text-muted-foreground py-6">No registrations yet.</p>;
  return (
    <div className="space-y-2">
      {leads.map((l: any) => (
        <Card key={l.id}><CardContent className="pt-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="font-medium">{l.first_name} {l.last_name} <Badge variant="secondary" className="ml-1">{l.status}</Badge></div>
            <div className="text-xs text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ")}{l.sms_opt_in ? " · texts OK" : ""}</div>
            {l.message && <div className="text-xs italic">"{l.message}"</div>}
            {Object.entries(l.custom_answers || {}).map(([k, v]) => <div key={k} className="text-xs"><b>{k}:</b> {String(v)}</div>)}
            <div className="flex flex-wrap gap-1 items-center">
              {(l.tags || []).map((t: string) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
              <Input className="h-6 w-28 text-xs" placeholder="+ tag" value={tagInput[l.id] || ""} onChange={(x) => setTagInput((p) => ({ ...p, [l.id]: x.target.value }))} onKeyDown={(x) => x.key === "Enter" && addTag(l)} />
            </div>
          </div>
          {l.attendee_id ? <Badge>In directory</Badge> : <Button size="sm" onClick={() => markAttended(l.id)}><UserCheck className="h-4 w-4 mr-1" />Mark attended</Button>}
        </CardContent></Card>
      ))}
    </div>
  );
}

function EventMessages({ eventId }: { eventId: string }) {
  const { data: rows = [], refetch } = useQuery({
    queryKey: ["event-messages", eventId],
    queryFn: async () => ((await db.from("funnel_messages").select("*, funnel_leads(first_name,last_name)").eq("event_id", eventId).order("scheduled_for")).data || []),
  });
  const review = useMemo(() => rows.filter((r: any) => r.status === "review"), [rows]);
  const setStatus = async (id: string, status: string) => { await db.from("funnel_messages").update({ status }).eq("id", id); refetch(); };
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6">No messages scheduled yet.</p>;
  return (
    <div className="space-y-2">
      {review.length > 0 && <p className="text-sm font-medium">{review.length} waiting for review</p>}
      {rows.map((r: any) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
          {r.channel === "email" ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
          <span className="font-medium">{r.step}</span>
          <span className="text-muted-foreground">to {r.funnel_leads?.first_name} {r.funnel_leads?.last_name}</span>
          <span className="text-muted-foreground">· {fmt(r.scheduled_for)}</span>
          <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
          {r.error && <span className="text-xs text-destructive">{r.error}</span>}
          <div className="ml-auto flex gap-1">
            {r.status === "review" && <Button size="sm" onClick={() => setStatus(r.id, "pending")}>Approve</Button>}
            {(r.status === "review" || r.status === "pending") && <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "cancelled")}>Cancel</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}

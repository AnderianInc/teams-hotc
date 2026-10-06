import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CalendarDays, CheckCircle2, HeartHandshake, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type FormConfig = {
  require_last_name?: boolean;
  require_email?: boolean;
  require_phone?: boolean;
  show_team_picker?: boolean;
  show_message?: boolean;
  show_sms_consent?: boolean;
  sms_consent_text?: string;
  custom_questions?: { id: string; label: string; required?: boolean }[];
};

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : "";

export default function EventRegistration({ slug: slugProp }: { slug?: string }) {
  const params = useParams();
  const slug = slugProp || params.slug || "";
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", message: "",
    teamIds: [] as string[], smsOptIn: false, website: "", answers: {} as Record<string, string>,
  });

  const { data: event, isLoading } = useQuery({
    queryKey: ["public-event", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("events")
        .select("id, slug, name, description, start_at, location, form_config")
        .eq("slug", slug).eq("status", "published").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const cfg = (event?.form_config || {}) as FormConfig;

  const { data: teams = [] } = useQuery({
    queryKey: ["volunteer-teams-public"],
    enabled: !!cfg.show_team_picker,
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id, name")
        .eq("team_type", "volunteer").order("name");
      if (error) throw error;
      return data;
    },
  });

  const update = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  const toggleTeam = (id: string) => setForm((p) => ({
    ...p, teamIds: p.teamIds.includes(id) ? p.teamIds.filter((t) => t !== id) : [...p.teamIds, id],
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams(window.location.search);
      const { data, error: fnError } = await supabase.functions.invoke("event-register", {
        body: {
          slug, first_name: form.firstName, last_name: form.lastName, email: form.email,
          phone: form.phone, team_ids: form.teamIds, message: form.message, answers: form.answers,
          sms_opt_in: form.smsOptIn, website: form.website,
          utm_source: q.get("utm_source") || "", utm_medium: q.get("utm_medium") || "",
          utm_campaign: q.get("utm_campaign") || "", utm_content: q.get("utm_content") || "",
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md text-center"><CardContent className="py-8">This event isn't open for registration.</CardContent></Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                <CheckCircle2 className="h-8 w-8 text-accent-foreground" />
              </div>
            </div>
            <h2 className="text-2xl font-display font-bold">You're registered, {form.firstName}!</h2>
            <p className="text-muted-foreground">
              We can't wait to see you at <strong>{event.name}</strong>{event.start_at && <> on <strong>{fmtWhen(event.start_at)}</strong></>}.
              {form.email && " A confirmation is on its way to your inbox."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <HeartHandshake className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-display">{event.name}</CardTitle>
          <CardDescription>{event.description || "House of Transformation Church"}</CardDescription>
          {event.location && (
            <div className="flex justify-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{event.location}</div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name{cfg.require_last_name ? " *" : ""}</Label>
                <Input id="lastName" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required={!!cfg.require_last_name} maxLength={80} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email{cfg.require_email ? " *" : ""}</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" required={!!cfg.require_email} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile Phone{cfg.require_phone ? " *" : ""}</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(555) 123-4567" required={!!cfg.require_phone} maxLength={30} />
            </div>
            {cfg.show_team_picker && teams.length > 0 && (
              <div className="space-y-2">
                <Label>Which teams interest you? (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {teams.map((t) => (
                    <button key={t.id} type="button" onClick={() => toggleTeam(t.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        form.teamIds.includes(t.id) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                      }`}>{t.name}</button>
                  ))}
                </div>
              </div>
            )}
            {(cfg.custom_questions || []).map((cq) => (
              <div key={cq.id} className="space-y-2">
                <Label>{cq.label}{cq.required ? " *" : ""}</Label>
                <Input value={form.answers[cq.label] || ""} required={!!cq.required} maxLength={500}
                  onChange={(e) => setForm((p) => ({ ...p, answers: { ...p.answers, [cq.label]: e.target.value } }))} />
              </div>
            ))}
            {cfg.show_message && (
              <div className="space-y-2">
                <Label htmlFor="message">Any questions? (optional)</Label>
                <Textarea id="message" value={form.message} onChange={(e) => update("message", e.target.value)} maxLength={2000} rows={3} />
              </div>
            )}
            <input type="text" name="website" value={form.website} onChange={(e) => update("website", e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {cfg.show_sms_consent && (
              <div className="rounded-md border-2 border-primary/30 bg-muted/30 p-4 space-y-2">
                <div className="text-sm font-semibold">Text reminders (optional)</div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={form.smsOptIn}
                    onChange={(e) => update("smsOptIn", e.target.checked)} disabled={!form.phone} />
                  <span className="text-xs leading-snug">
                    Yes, text me a confirmation and reminders about this event. Message and data rates may apply.
                    Reply <strong>STOP</strong> to unsubscribe at any time. See our{" "}
                    <a href="/sms-policy" target="_blank" rel="noopener" className="text-primary underline">SMS Terms</a>.
                    Your mobile information will not be shared with third parties for marketing.
                  </span>
                </label>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Registering..." : <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Register</span>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

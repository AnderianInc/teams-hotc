import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, CheckCircle2, Church, Clock, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function nextSundays(count: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // next Sunday (not today)
  for (let i = 0; i < count; i++) {
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    out.push({ value, label });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

export default function PlanAVisit() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    visitDate: "",
    adults: "1",
    kids: "0",
    kidsAges: "",
    message: "",
    smsOptIn: false,
    website: "", // honeypot
  });

  const sundays = nextSundays(8);
  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const visitLabel =
    sundays.find((s) => s.value === form.visitDate)?.label || "your visit day";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      const { data, error: fnError } = await supabase.functions.invoke("plan-visit-submit", {
        body: {
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          phone: form.phone,
          visit_date: form.visitDate,
          adults_count: parseInt(form.adults, 10) || 1,
          kids_count: parseInt(form.kids, 10) || 0,
          kids_ages: form.kidsAges,
          message: form.message,
          sms_opt_in: form.smsOptIn,
          utm_source: params.get("utm_source") || "",
          utm_medium: params.get("utm_medium") || "",
          utm_campaign: params.get("utm_campaign") || "",
          utm_content: params.get("utm_content") || "",
          website: form.website,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
            <h2 className="text-2xl font-display font-bold">You're all set, {form.firstName}!</h2>
            <p className="text-muted-foreground">
              We can't wait to meet you on <strong>{visitLabel}</strong>.
              {form.email && " A confirmation is on its way to your inbox."}
              {form.smsOptIn && form.phone && " We'll also text you a reminder."}
            </p>
            <div className="space-y-2 pt-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Sundays at 10:00 AM</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>House of Transformation Church</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              When you arrive, just tell a greeter it's your first time — they'll take care of everything.
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
              <Church className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-display">Plan Your Visit</CardTitle>
          <CardDescription>
            House of Transformation Church — pick a Sunday and we'll have everything ready for you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  required
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  maxLength={80}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@example.com"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="(555) 123-4567"
                maxLength={30}
              />
            </div>
            <div className="space-y-2">
              <Label>Which Sunday will you join us? *</Label>
              <Select value={form.visitDate} onValueChange={(v) => update("visitDate", v)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a Sunday..." />
                </SelectTrigger>
                <SelectContent>
                  {sundays.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Adults</Label>
                <Select value={form.adults} onValueChange={(v) => update("adults", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4", "5+"].map((n) => (
                      <SelectItem key={n} value={n.replace("+", "")}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kids</Label>
                <Select value={form.kids} onValueChange={(v) => update("kids", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["0", "1", "2", "3", "4", "5+"].map((n) => (
                      <SelectItem key={n} value={n.replace("+", "")}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {parseInt(form.kids, 10) > 0 && (
              <div className="space-y-2">
                <Label htmlFor="kidsAges">Kids' ages</Label>
                <Input
                  id="kidsAges"
                  value={form.kidsAges}
                  onChange={(e) => update("kidsAges", e.target.value)}
                  placeholder="e.g. 3, 7, 10"
                  maxLength={200}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="message">Anything we should know? (optional)</Label>
              <Textarea
                id="message"
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
                placeholder="Questions, prayer requests, accessibility needs..."
                maxLength={2000}
                rows={3}
              />
            </div>
            {/* Honeypot — hidden from humans */}
            <input
              type="text"
              name="website"
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <div className="rounded-md border-2 border-primary/30 bg-muted/30 p-4 space-y-2">
              <div className="text-sm font-semibold">Text reminders (optional)</div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.smsOptIn}
                  onChange={(e) => update("smsOptIn", e.target.checked)}
                  disabled={!form.phone}
                />
                <span className="text-xs leading-snug">
                  Yes, text me a confirmation and a reminder about my visit. Message and data rates
                  may apply. Reply <strong>STOP</strong> to unsubscribe at any time. See our{" "}
                  <a href="/sms-policy" target="_blank" rel="noopener" className="text-primary underline">
                    SMS Terms
                  </a>
                  . Your mobile information will not be shared with third parties for marketing.
                </span>
              </label>
              {!form.phone && (
                <p className="text-xs text-muted-foreground italic">
                  Enter a mobile number above to enable text reminders.
                </p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !form.visitDate}>
              {loading ? "Planning your visit..." : (
                <span className="inline-flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4" /> Plan My Visit
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

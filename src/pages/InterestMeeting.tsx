import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2, HeartHandshake, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

type Session = {
  id: string;
  session_date: string;
  start_time: string | null;
  location: string | null;
};

type Team = { id: string; name: string };

export default function InterestMeeting() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    sessionId: "",
    teamIds: [] as string[],
    message: "",
    smsOptIn: false,
    website: "", // honeypot
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["interest-meeting-sessions-public"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("interest_meeting_sessions")
        .select("id, session_date, start_time, location")
        .eq("is_active", true)
        .gte("session_date", today)
        .order("session_date", { ascending: true });
      if (error) throw error;
      return data as Session[];
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["volunteer-teams-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name")
        .eq("team_type", "volunteer")
        .order("name");
      if (error) throw error;
      return data as Team[];
    },
  });

  const update = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleTeam = (id: string) =>
    setForm((prev) => ({
      ...prev,
      teamIds: prev.teamIds.includes(id)
        ? prev.teamIds.filter((t) => t !== id)
        : [...prev.teamIds, id],
    }));

  // Auto-attach the (first) upcoming session — no picker on the form.
  useEffect(() => {
    if (!form.sessionId && sessions.length > 0) {
      setForm((prev) => ({ ...prev, sessionId: sessions[0].id }));
    }
  }, [sessions, form.sessionId]);

  const selectedSession = sessions.find((s) => s.id === form.sessionId);
  const sessionLabel = selectedSession
    ? `${format(parseISO(selectedSession.session_date), "EEEE, MMMM d")}${
        selectedSession.start_time ? ` at ${selectedSession.start_time.slice(0, 5)}` : ""
      }`
    : "the meeting";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(window.location.search);
      const { data, error: fnError } = await supabase.functions.invoke("interest-meeting-submit", {
        body: {
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          phone: form.phone,
          session_id: form.sessionId,
          team_ids: form.teamIds,
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
            <h2 className="text-2xl font-display font-bold">You're registered, {form.firstName}!</h2>
            <p className="text-muted-foreground">
              We can't wait to see you at the Interest Meeting on <strong>{sessionLabel}</strong>.
              {form.email && " A confirmation is on its way to your inbox."}
              {form.smsOptIn && form.phone && " We'll also text you a reminder."}
            </p>
            {selectedSession?.location && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
                <MapPin className="h-4 w-4" />
                <span>{selectedSession.location}</span>
              </div>
            )}
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
          <CardTitle className="text-2xl font-display">Interest Meeting</CardTitle>
          <CardDescription>
            House of Transformation Church — come meet the teams and find where you fit
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
            {sessions.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No upcoming dates listed yet — check back soon!
              </p>
            )}
            {teams.length > 0 && (
              <div className="space-y-2">
                <Label>Which teams interest you? (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTeam(t.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        form.teamIds.includes(t.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="message">Any questions? (optional)</Label>
              <Textarea
                id="message"
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
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
                  Yes, text me a confirmation and a reminder about the meeting. Message and data
                  rates may apply. Reply <strong>STOP</strong> to unsubscribe at any time. See our{" "}
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
            <Button type="submit" className="w-full" disabled={loading || !form.sessionId}>
              {loading ? "Registering..." : (
                <span className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Register for the Meeting
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

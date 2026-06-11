import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Team = { id: string; name: string; slug: string };

export default function JoinTeam() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    note: "",
    smsOptIn: false,
  });
  const [preferredTeamIds, setPreferredTeamIds] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("teams")
      .select("id, name, slug")
      .neq("slug", "staff")
      .order("name")
      .then(({ data }) => setTeams((data as Team[]) || []));
  }, []);

  const update = (field: keyof typeof form, value: string | boolean) =>
    setForm((p) => ({ ...p, [field]: value }));

  const toggleTeam = (id: string) =>
    setPreferredTeamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.email && !form.phone) {
      setError("Please provide an email or phone number so we can reach you.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-volunteer-interest", {
        body: { ...form, preferredTeamIds },
      });
      if (fnError) throw fnError;
      if ((data as any)?.error) throw new Error((data as any).error);
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
            <h2 className="text-2xl font-display font-bold">You're on the list!</h2>
            <p className="text-muted-foreground">
              Thanks for stepping up to serve. Someone from our team will reach out about training and next steps.
            </p>
            <div className="flex items-center justify-center gap-2 text-muted-foreground pt-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm">Welcome to the team!</span>
            </div>
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
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-display">Join the Team</CardTitle>
          <CardDescription>
            Ready to serve at House of Transformation Church? Tell us a bit about yourself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required maxLength={50} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(555) 123-4567" maxLength={20} />
            </div>

            {teams.length > 0 && (
              <div className="space-y-2">
                <Label>Any teams you're especially interested in? <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {teams.map((t) => {
                    const active = preferredTeamIds.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => toggleTeam(t.id)}
                        className="focus:outline-none"
                      >
                        <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
                          {t.name}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="note">Anything else? <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="note"
                value={form.note}
                onChange={(e) => update("note", e.target.value)}
                placeholder="Why you'd like to serve, gifts you'd bring, availability…"
                maxLength={1000}
                rows={3}
              />
            </div>

            <div className="rounded-md border-2 border-primary/30 bg-muted/30 p-4 space-y-2">
              <div className="text-sm font-semibold">Text message (SMS) consent</div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.smsOptIn}
                  onChange={(e) => update("smsOptIn", e.target.checked)}
                  disabled={!form.phone}
                />
                <span className="text-xs leading-snug">
                  Yes, I agree to receive recurring <strong>text messages (SMS)</strong> from House of Transformation Church
                  about volunteering, training, and team scheduling. Msg frequency varies. Msg & data rates may apply.
                  Reply <strong>HELP</strong> for help, <strong>STOP</strong> to unsubscribe. See our{" "}
                  <a href="/sms-policy" target="_blank" rel="noopener" className="text-primary underline">SMS Terms</a>.
                </span>
              </label>
              {!form.phone && (
                <p className="text-xs text-muted-foreground italic">Enter a mobile phone number above to enable SMS opt-in.</p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting..." : "Sign me up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

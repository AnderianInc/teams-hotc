import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Church, Heart, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export default function Welcome() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [recognizing, setRecognizing] = useState(true);
  const [welcomeName, setWelcomeName] = useState('');
  const [returning, setReturning] = useState(false);
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [countdown, setCountdown] = useState(6);
  const [switchedGuest, setSwitchedGuest] = useState(false);
  const started = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    howHeard: "",
    prayerRequests: "",
    smsOptIn: false,
  });

  const acceptCheckIn = (data: { name?: string; token?: string; returning?: boolean }, isReturning = true) => {
    if (data.token) { try { localStorage.setItem('hotc_visitor_identity', data.token); } catch { /* storage optional */ } }
    setWelcomeName(data.name || '');
    setReturning(data.returning ?? isReturning);
    setSubmitted(true);
    queryClient.invalidateQueries({ queryKey: ['attendance-trend'] });
  };

  useEffect(() => {
    if (authLoading || started.current) return;
    started.current = true;
    let token: string | null = null;
    try { token = localStorage.getItem('hotc_visitor_identity'); } catch { /* storage optional */ }
    if (!user && !token) { setRecognizing(false); return; }
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('self-check-in', {
          body: user ? { type: 'signed_in' } : { type: 'device', token },
        });
        if (fnError || data?.error) {
          if (!user) { try { localStorage.removeItem('hotc_visitor_identity'); } catch { /* optional */ } }
          else setError('Unable to check you in. Please try your mobile number or ask the welcome team.');
        } else acceptCheckIn(data);
      } catch { setError('Unable to check in right now. Please try again.'); }
      finally { setRecognizing(false); }
    })();
  }, [authLoading, user]);

  useEffect(() => {
    if (!submitted || !user || switchedGuest) return;
    setCountdown(6);
    const interval = setInterval(() => setCountdown(n => Math.max(0, n - 1)), 1000);
    const timer = setTimeout(() => navigate('/dashboard'), 6000);
    return () => { clearInterval(interval); clearTimeout(timer); };
  }, [submitted, user, navigate, switchedGuest]);

  const phoneCheckIn = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('self-check-in', { body: { type: 'phone', phone: lookupPhone } });
      if (fnError) {
        const context = (fnError as { context?: Response }).context;
        const detail = context ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error || 'Unable to check in. Please try again.');
      }
      if (data?.error) throw new Error(data.error);
      acceptCheckIn(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to check in.'); }
    finally { setLoading(false); }
  };

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-visitor", {
        body: form,
      });
      if (fnError) {
        const context = (fnError as { context?: Response }).context;
        const detail = context ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error || 'Unable to register. Please try again.');
      }
      if (data?.error) throw new Error(data.error);
      acceptCheckIn(data, false);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (recognizing || authLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4" role="status">
      <Church className="h-10 w-10 text-primary mb-4" />
      <p className="text-lg font-display">Welcome to HOTC!</p>
      <p className="text-muted-foreground">Checking you in…</p>
    </div>
  );

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
            <h2 className="text-2xl font-display font-bold">{returning ? `Welcome back${welcomeName ? `, ${welcomeName}` : ""}!` : "Welcome to HOTC!"}</h2>
            <p className="text-lg">Thank you for coming to Church today.</p>
            {!returning && <p className="text-muted-foreground">We're so glad you're here.</p>}
            {user && !switchedGuest && <Button onClick={() => navigate('/dashboard')}>Go to Dashboard ({countdown})</Button>}
            <Button variant="ghost" onClick={() => {
              try { localStorage.removeItem('hotc_visitor_identity'); } catch { /* optional */ }
              setSwitchedGuest(true); setSubmitted(false); setError(''); setLookupOpen(true);
            }}>Not you? Switch guest</Button>
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
          <CardTitle className="text-2xl font-display">Welcome to HOTC!</CardTitle>
          <CardDescription>
            House of Transformation Church — We'd love to know a bit about you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-b pb-4 mb-4 space-y-3">
            <Button type="button" variant="outline" className="w-full" onClick={() => { setLookupOpen(v => !v); setError(''); }}>
              Already registered? Check in
            </Button>
            {lookupOpen && <form onSubmit={phoneCheckIn} className="space-y-3">
              <Label htmlFor="lookup-phone">Mobile number</Label>
              <Input id="lookup-phone" type="tel" autoComplete="tel" value={lookupPhone} onChange={e => setLookupPhone(e.target.value)} required />
              <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Checking in…' : 'Check In'}</Button>
            </form>}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  required
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  required
                  maxLength={50}
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
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="(555) 123-4567"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="howHeard">How did you hear about us?</Label>
              <Select value={form.howHeard} onValueChange={(v) => update("howHeard", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select one..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friend">Friend or Family</SelectItem>
                  <SelectItem value="social_media">Social Media</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="drove_by">Drove By</SelectItem>
                  <SelectItem value="event">Church Event</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prayerRequests">Prayer Requests</Label>
              <Textarea
                id="prayerRequests"
                value={form.prayerRequests}
                onChange={(e) => update("prayerRequests", e.target.value)}
                placeholder="Anything you'd like us to pray about..."
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
                  Yes, I agree to receive recurring <strong>text messages (SMS)</strong> from House of
                  Transformation Church at the mobile number I provided above. Messages may include:
                  welcome and first-time visitor follow-ups, service and event reminders, prayer follow-up
                  and pastoral check-ins, volunteer scheduling reminders, and general church announcements.
                  Message frequency varies (typically 2&ndash;6 messages per month). Message and data rates
                  may apply. Reply <strong>HELP</strong> for help, reply <strong>STOP</strong> to
                  unsubscribe at any time. Consent to receive text messages is <strong>not a condition</strong>{" "}
                  of attending the church or any service. See our{" "}
                  <a href="/sms-policy" target="_blank" rel="noopener" className="text-primary underline">
                    SMS Terms
                  </a>{" "}
                  and{" "}
                  <a href="/sms-policy#privacy" target="_blank" rel="noopener" className="text-primary underline">
                    Privacy Policy
                  </a>
                  . Your mobile information will not be shared with third parties or affiliates for
                  marketing purposes.
                </span>
              </label>
              {!form.phone && (
                <p className="text-xs text-muted-foreground italic">
                  Enter a mobile phone number above to enable SMS opt-in.
                </p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

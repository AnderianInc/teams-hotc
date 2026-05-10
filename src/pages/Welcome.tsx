import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Church, Heart, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Welcome() {
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

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-visitor", {
        body: form,
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
            <h2 className="text-2xl font-display font-bold">Thank You!</h2>
            <p className="text-muted-foreground">
              Welcome to House of Transformation Church! We're so glad you're here.
              {form.email && " Check your email for more info about getting connected."}
            </p>
            <div className="flex items-center justify-center gap-2 text-muted-foreground pt-4">
              <Heart className="h-4 w-4 text-destructive" />
              <span className="text-sm">See you next Sunday!</span>
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
              <Church className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-display">Welcome to HOTC!</CardTitle>
          <CardDescription>
            House of Transformation Church — We'd love to know a bit about you
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

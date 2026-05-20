import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Church, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function ProofOfConsent() {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Church className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold leading-tight">
              Proof of SMS Opt-In Consent
            </h1>
            <p className="text-sm text-muted-foreground">
              House of Transformation Church (HOTC) — Twilio A2P 10DLC submission evidence
            </p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Where consent is collected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
            <p>
              House of Transformation Church (HOTC) collects express written SMS opt-in consent at the following
              public-facing URLs. Each form contains an unchecked SMS opt-in checkbox that the user must
              affirmatively select before any text message is sent. Consent is not a condition of any other
              service.
            </p>
            <ul className="space-y-3">
              <li className="rounded-md border p-3">
                <div className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Website Welcome / Connect Card
                </div>
                <a
                  href="https://teams.hotc.life/welcome"
                  className="text-primary underline text-xs break-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://teams.hotc.life/welcome
                </a>
                <p className="text-xs text-muted-foreground mt-1">
                  First-time visitors and prospective members fill out this form. The SMS opt-in checkbox is
                  separate from any other agreement and is not pre-checked.
                </p>
              </li>
              <li className="rounded-md border p-3">
                <div className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> In-person Connect Kiosk (same form)
                </div>
                <a
                  href="https://teams.hotc.life/welcome"
                  className="text-primary underline text-xs break-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://teams.hotc.life/welcome
                </a>
                <p className="text-xs text-muted-foreground mt-1">
                  Tablet kiosk at the church entrance running the same opt-in form.
                </p>
              </li>
              <li className="rounded-md border p-3">
                <div className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Volunteer-recorded verbal consent
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  When a guest opts in verbally to a First Impressions volunteer, the volunteer records the opt-in
                  (with timestamp, source, and the volunteer&rsquo;s identity) in our internal church management
                  system before any text is sent. Records are auditable in the <code>sms_opt_in_*</code> fields of
                  our attendee/profile database.
                </p>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exact opt-in language shown to the user</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>The checkbox on every collection point is labeled with the following text:</p>
            <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
              &ldquo;Yes, I agree to receive recurring <strong>text messages (SMS)</strong> from House of
              Transformation Church at the mobile number I provided above. Messages may include: welcome
              and first-time visitor follow-ups, service and event reminders, prayer follow-up and pastoral
              check-ins, volunteer scheduling reminders, and general church announcements. Message
              frequency varies (typically 2&ndash;6 messages per month). Message and data rates may apply.
              Reply <strong>HELP</strong> for help, reply <strong>STOP</strong> to unsubscribe at any time.
              Consent to receive text messages is <strong>not a condition</strong> of attending the church
              or any service.&rdquo;
            </blockquote>
            <p>
              The checkbox is rendered in an unchecked state by default and the user must actively select it.
              The SMS consent checkbox is displayed in its own bordered section, <strong>separate from</strong>{" "}
              any acceptance of our Privacy Policy or Terms of Service. The underlying form will not submit
              an SMS opt-in record unless the user checks the box.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What happens with the consent record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Each opt-in is stored with the timestamp (<code>sms_opt_in_at</code>), the source URL or volunteer
                identity (<code>sms_opt_in_source</code>), and the exact opt-in text the user agreed to
                (<code>sms_opt_in_text</code>).
              </li>
              <li>
                Our SMS sending system (Twilio) refuses to deliver any message to a phone number unless a
                matching opt-in record exists, or a staff member explicitly overrides with a written consent note.
              </li>
              <li>
                Every outbound message automatically appends &ldquo;Reply STOP to unsubscribe&rdquo; when not
                already present in the body.
              </li>
              <li>
                Opt-in data and consent records are <strong>not shared with third parties or affiliates for
                marketing or promotional purposes</strong>.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Related public pages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm leading-relaxed">
            <p>
              Full SMS terms, privacy, and opt-out instructions:{" "}
              <a href="/sms-policy" className="text-primary underline">teams.hotc.life/sms-policy</a>
            </p>
            <p>
              Welcome / Connect form (live opt-in collection):{" "}
              <a href="/welcome" className="text-primary underline">teams.hotc.life/welcome</a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm leading-relaxed">
            <p>House of Transformation Church</p>
            <p>
              Email:{" "}
              <a href="mailto:contact@hotc.life" className="text-primary underline">
                contact@hotc.life
              </a>
            </p>
            <p>
              Web:{" "}
              <a href="https://teams.hotc.life" className="text-primary underline">
                teams.hotc.life
              </a>
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Last updated:{" "}
          {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.{" "}
          <Link to="/" className="underline">Return to site</Link>.
        </p>
      </div>
    </div>
  );
}

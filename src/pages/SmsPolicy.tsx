import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Church } from "lucide-react";
import { Link } from "react-router-dom";

export default function SmsPolicy() {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Church className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold leading-tight">
              SMS / Text Messaging Terms & Opt-In Policy
            </h1>
            <p className="text-sm text-muted-foreground">House of Transformation Church (HOTC)</p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>How we collect consent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed">
            <p>
              House of Transformation Church (&quot;HOTC&quot;, &quot;we&quot;, &quot;us&quot;) sends text (SMS) messages
              only to individuals who have given us express, written opt-in consent. We collect this opt-in in the
              following ways:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Welcome / Connection Card on our website</strong>{" "}
                (<a href="https://teams.hotc.life/welcome" className="text-primary underline">teams.hotc.life/welcome</a>)
                and at our in-person Connect kiosk. The form contains a clearly labeled SMS opt-in checkbox that the
                person must affirmatively check. The checkbox is <em>not</em> pre-selected.
              </li>
              <li>
                <strong>In-person paper Connect Cards</strong> handed out during Sunday services that include the same
                opt-in language and a checkbox the person must mark.
              </li>
              <li>
                <strong>First Impressions team-recorded consent</strong>: when a guest gives verbal opt-in to a
                volunteer, the volunteer records the opt-in (with timestamp and the volunteer&rsquo;s name) in our
                internal church management system before any text is sent.
              </li>
            </ul>

            <h3 className="font-semibold pt-4">Exact opt-in language presented to users</h3>
            <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
              &ldquo;Yes, I agree to receive recurring text messages from House of Transformation Church about
              upcoming services, events, prayer follow-up, and community announcements at the phone number provided.
              Message frequency varies. Message and data rates may apply. Reply <strong>HELP</strong> for help, reply
              <strong> STOP</strong> to unsubscribe at any time. Consent is not a condition of any purchase.&rdquo;
            </blockquote>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Types of messages we send</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <ul className="list-disc pl-6 space-y-1">
              <li>Welcome &amp; first-time visitor follow-up messages</li>
              <li>Service reminders and event invitations</li>
              <li>Prayer follow-up and pastoral check-ins</li>
              <li>Volunteer scheduling reminders for serving teams</li>
              <li>General church announcements</li>
            </ul>
            <p className="pt-2">
              <strong>Message frequency:</strong> typically 2&ndash;6 messages per month. May be higher during major
              event seasons.
            </p>
            <p>
              <strong>Costs:</strong> Message and data rates may apply, depending on your mobile carrier&rsquo;s plan.
              HOTC does not charge for the messages themselves.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>How to opt out (STOP)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <p>
              You can opt out of HOTC text messages <strong>at any time</strong> by replying <strong>STOP</strong>,
              <strong> END</strong>, <strong>QUIT</strong>, <strong>UNSUBSCRIBE</strong>, or <strong>CANCEL</strong> to
              any message we send. After we receive your opt-out, you will receive one final confirmation message and
              no further texts. You may resubscribe at any time by replying <strong>START</strong> or by re-submitting
              the Connect form on our website.
            </p>
            <p>
              For help, reply <strong>HELP</strong> to any message, or contact us using the information below.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Privacy</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed">
            <p>
              We do not sell, rent, share, or otherwise disclose your phone number or any information collected
              through our text messaging program to any third party for their marketing purposes. Phone numbers
              collected for SMS are only used by HOTC staff and approved volunteers for the church-related
              communication described above.
            </p>
            <p>
              Mobile opt-in data and consent records are <strong>not shared with third parties or affiliates for
              marketing or promotional purposes</strong>. They are used solely to deliver the messages you have
              requested and to comply with applicable telecommunications regulations.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contact us</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm leading-relaxed">
            <p>House of Transformation Church</p>
            <p>Email: <a href="mailto:hotc@pneumanation.com" className="text-primary underline">hotc@pneumanation.com</a></p>
            <p>Web: <a href="https://teams.hotc.life" className="text-primary underline">teams.hotc.life</a></p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.{" "}
          <Link to="/" className="underline">Return to site</Link>.
        </p>
      </div>
    </div>
  );
}

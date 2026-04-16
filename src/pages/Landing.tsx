import { Link } from "react-router-dom";
import { Users, Baby, Star, Shield, Wifi, QrCode, ArrowRight, CheckCircle } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Volunteer Team Management",
    description:
      "Organize worship, media, ushers, and more into dedicated teams with role-based access for leads and members.",
  },
  {
    icon: Baby,
    title: "Kids Check-In",
    description:
      "Fast, secure child check-in with family lookup, room assignment, and thermal receipt printing.",
  },
  {
    icon: Star,
    title: "First Impressions",
    description:
      "Track visitors, manage follow-ups, and keep your welcome team connected with real-time attendee lists.",
  },
  {
    icon: QrCode,
    title: "QR Code Check-In",
    description:
      "Generate QR codes for contactless check-in. Families scan and check in instantly from their phone.",
  },
  {
    icon: Wifi,
    title: "Offline Ready",
    description:
      "Keep running even when the Wi-Fi goes down. Data syncs automatically when connectivity is restored.",
  },
  {
    icon: Shield,
    title: "Role-Based Security",
    description:
      "Admins, team leads, and members each see only what they need — backed by row-level database security.",
  },
];

const highlights = [
  "Roster & attendance tracking",
  "Weekly attendance analytics",
  "Church directory management",
  "Email templates & communications",
  "Dark mode support",
  "Mobile-optimized interface",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-16">
          <span className="font-display font-bold text-xl text-primary">HOTC Volunteers</span>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign In <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-6">
          <Star className="w-3.5 h-3.5" /> Built for House of the Cross
        </div>
        <h1 className="font-display font-bold text-5xl md:text-6xl leading-tight mb-6 max-w-3xl mx-auto">
          Serving made <span className="text-primary">simple</span> for your whole church team
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
          One platform for volunteer coordination, kids check-in, visitor follow-up, and church
          administration — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
          >
            Get Started <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/check-in"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border bg-card font-semibold hover:bg-secondary transition-colors"
          >
            Kids Check-In Kiosk
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16">
        <h2 className="font-display font-bold text-3xl text-center mb-12">
          Everything your team needs
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-accent-foreground" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Highlights strip */}
      <section className="bg-primary/5 border-y border-border py-14">
        <div className="container">
          <h2 className="font-display font-bold text-2xl text-center mb-8">Also included</h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24 text-center">
        <h2 className="font-display font-bold text-4xl mb-4">Ready to get started?</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Sign in with your church account to access your team dashboard.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          Sign In <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} House of the Cross. All rights reserved.</span>
          <Link to="/feedback" className="hover:text-foreground transition-colors">
            Send Feedback
          </Link>
        </div>
      </footer>
    </div>
  );
}

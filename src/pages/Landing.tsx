import { Link } from "react-router-dom";
import { Users, Baby, Star, Shield, ArrowRight } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Volunteer Teams",
    description: "Organize ministries, assign roles, and coordinate your serving teams in one place.",
  },
  {
    icon: Baby,
    title: "Kids Check-In",
    description: "Fast, secure family check-in with room assignment and label printing.",
  },
  {
    icon: Star,
    title: "First Impressions",
    description: "Welcome guests, track visits, and follow up so no one falls through the cracks.",
  },
  {
    icon: Shield,
    title: "Secure & Offline-Ready",
    description: "Role-based access with offline support so your team keeps serving, no matter what.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
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
        <h1 className="font-display font-bold text-4xl md:text-5xl leading-tight mb-6 max-w-2xl mx-auto">
          Serving made <span className="text-primary">simple</span> for the whole church team
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
          The HOTC Volunteer Hub — one place for your teams, kids check-in, guest follow-up,
          and church directory.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          Sign In to Continue <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Features */}
      <section className="container pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-accent-foreground" />
              </div>
              <h3 className="font-display font-semibold text-base mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} House of Transformation Church. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

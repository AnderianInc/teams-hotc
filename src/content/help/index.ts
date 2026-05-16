// Help center article registry. Each article is markdown shipped as a raw string
// via Vite's ?raw import, so non-devs can edit the .md files directly.
import welcome from "./articles/welcome.md?raw";
import roles from "./articles/roles.md?raw";
import signin from "./articles/signin.md?raw";
import fiVisitors from "./articles/fi-visitors.md?raw";
import fiPipeline from "./articles/fi-pipeline.md?raw";
import fiExternal from "./articles/fi-external.md?raw";
import fiFollowups from "./articles/fi-followups.md?raw";
import kidsCheckin from "./articles/kids-checkin.md?raw";
import kidsFamily from "./articles/kids-family.md?raw";
import teamsRoster from "./articles/teams-roster.md?raw";
import teamsCalendar from "./articles/teams-calendar.md?raw";
import teamsBlocked from "./articles/teams-blocked.md?raw";
import commsEmail from "./articles/comms-email.md?raw";
import commsSmsOptIn from "./articles/comms-sms-optin.md?raw";
import commsBirthdays from "./articles/comms-birthdays.md?raw";
import adminDirectory from "./articles/admin-directory.md?raw";
import adminSources from "./articles/admin-sources.md?raw";
import adminSecurity from "./articles/admin-security.md?raw";
import faq from "./articles/faq.md?raw";

export type ArticleRole = "public" | "member" | "team_lead" | "staff" | "admin";

export interface Article {
  slug: string;
  title: string;
  section: string;
  role: ArticleRole;
  content: string;
}

export const ARTICLES: Article[] = [
  { slug: "welcome", title: "Welcome & system overview", section: "Getting started", role: "public", content: welcome },
  { slug: "roles", title: "Roles explained", section: "Getting started", role: "public", content: roles },
  { slug: "signin", title: "Signing in & profile setup", section: "Getting started", role: "public", content: signin },

  { slug: "fi-visitors", title: "Registering a visitor", section: "First Impressions", role: "staff", content: fiVisitors },
  { slug: "fi-pipeline", title: "Outreach pipeline", section: "First Impressions", role: "staff", content: fiPipeline },
  { slug: "fi-external", title: "External sources (prayer / visit / interest)", section: "First Impressions", role: "staff", content: fiExternal },
  { slug: "fi-followups", title: "Logging follow-ups & the 'contacted' tag", section: "First Impressions", role: "staff", content: fiFollowups },

  { slug: "kids-checkin", title: "Check-in / check-out flow", section: "Children's Ministry", role: "staff", content: kidsCheckin },
  { slug: "kids-family", title: "Registering a family", section: "Children's Ministry", role: "staff", content: kidsFamily },

  { slug: "teams-roster", title: "Building a roster", section: "Teams & Scheduling", role: "team_lead", content: teamsRoster },
  { slug: "teams-calendar", title: "Calendar view", section: "Teams & Scheduling", role: "member", content: teamsCalendar },
  { slug: "teams-blocked", title: "Blocking dates & responding to assignments", section: "Teams & Scheduling", role: "member", content: teamsBlocked },

  { slug: "comms-email", title: "Sending emails & SMS", section: "Communications", role: "team_lead", content: commsEmail },
  { slug: "comms-sms-optin", title: "SMS opt-in rules", section: "Communications", role: "public", content: commsSmsOptIn },
  { slug: "comms-birthdays", title: "Birthday automation", section: "Communications", role: "admin", content: commsBirthdays },

  { slug: "admin-directory", title: "Directory management", section: "Admin", role: "admin", content: adminDirectory },
  { slug: "admin-sources", title: "External sources & sequences", section: "Admin", role: "admin", content: adminSources },
  { slug: "admin-security", title: "Security & access (plain English)", section: "Admin", role: "admin", content: adminSecurity },

  { slug: "faq", title: "Troubleshooting & FAQ", section: "Help", role: "public", content: faq },
];

export function roleAllows(userRole: ArticleRole, articleRole: ArticleRole): boolean {
  const order: ArticleRole[] = ["public", "member", "team_lead", "staff", "admin"];
  return order.indexOf(userRole) >= order.indexOf(articleRole);
}

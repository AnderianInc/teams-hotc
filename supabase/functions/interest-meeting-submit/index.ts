// Public endpoint for the /interest-meeting page. Validates input, rate-limits,
// creates a funnel_leads row (lead_type='interest'), and queues the follow-up sequence.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHURCH_TZ = "America/Los_Angeles";

const BodySchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().email().max(200).optional().or(z.literal("")).default(""),
  phone: z.string().trim().max(30).optional().default(""),
  session_id: z.string().uuid(),
  team_ids: z.array(z.string().uuid()).max(10).optional().default([]),
  message: z.string().max(2000).optional().default(""),
  sms_opt_in: z.boolean().default(false),
  utm_source: z.string().max(120).optional().default(""),
  utm_medium: z.string().max(120).optional().default(""),
  utm_campaign: z.string().max(120).optional().default(""),
  utm_content: z.string().max(120).optional().default(""),
  website: z.string().optional().default(""), // honeypot — must stay empty
});

function normalizePhone(p: string): string | null {
  const digits = (p || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : null;
}

// Build a UTC instant for dateStr at hour:minute in America/Los_Angeles
function atChurchTime(dateStr: string, hour: number, minute = 0): Date {
  const guess = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHURCH_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  const asUTC = Date.UTC(+get("year"), +get("month") - 1, +get("day"), +get("hour") % 24, +get("minute"));
  const offset = asUTC - guess.getTime();
  return new Date(Date.UTC(
    +dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), hour, minute,
  ) - offset);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Please check the form fields and try again." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const input = parsed.data;

    // Honeypot: bots fill hidden fields
    if (input.website) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!input.email && !input.phone) {
      return new Response(JSON.stringify({ error: "Please provide an email or phone number so we can reach you." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate the session
    const { data: session } = await supabase
      .from("interest_meeting_sessions")
      .select("id, session_date, start_time, location, is_active")
      .eq("id", input.session_id)
      .maybeSingle();
    if (!session || !session.is_active) {
      return new Response(JSON.stringify({ error: "That meeting date is no longer available — please pick another." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 5 submissions per phone/email per day
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const phoneE164 = normalizePhone(input.phone);
    const emailLower = input.email.toLowerCase();
    if (phoneE164 || emailLower) {
      let q = supabase.from("funnel_leads").select("id", { count: "exact", head: true })
        .gte("created_at", dayAgo);
      const clauses: string[] = [];
      if (emailLower) clauses.push(`email.ilike.${emailLower}`);
      if (phoneE164) clauses.push(`phone.eq.${phoneE164}`);
      q = q.or(clauses.join(","));
      const { count } = await q;
      if ((count ?? 0) >= 5) {
        return new Response(JSON.stringify({ error: "You've already submitted recently — we'll be in touch soon!" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Team names for messaging
    let teamNames: string[] = [];
    if (input.team_ids.length) {
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", input.team_ids);
      teamNames = (teams || []).map((t: any) => t.name);
    }

    const { data: lead, error: insertErr } = await supabase
      .from("funnel_leads")
      .insert({
        first_name: input.first_name,
        last_name: input.last_name,
        email: emailLower || null,
        phone: phoneE164,
        lead_type: "interest",
        visit_date: session.session_date,
        preferred_team_ids: input.team_ids,
        message: input.message || null,
        sms_opt_in: input.sms_opt_in && !!phoneE164,
        sms_opt_in_at: input.sms_opt_in && phoneE164 ? new Date().toISOString() : null,
        sms_opt_in_text: input.sms_opt_in && phoneE164
          ? "Opted in via Interest Meeting form to receive meeting reminders by text."
          : null,
        utm_source: input.utm_source || null,
        utm_medium: input.utm_medium || null,
        utm_campaign: input.utm_campaign || null,
        utm_content: input.utm_content || null,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // Queue the follow-up sequence
    const name = input.first_name;
    const datePretty = new Date(`${session.session_date}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    const timeStr = session.start_time
      ? session.start_time.slice(0, 5)
      : null;
    const when = timeStr ? `${datePretty} at ${timeStr}` : datePretty;
    const where = session.location || "House of Transformation Church";
    const teamsStr = teamNames.length ? `\n\nTeams you're interested in: ${teamNames.join(", ")}` : "";

    const sessionStart = timeStr
      ? atChurchTime(session.session_date, +timeStr.slice(0, 2), +timeStr.slice(3, 5))
      : atChurchTime(session.session_date, 12);

    const msgs: Array<Record<string, unknown>> = [];

    if (emailLower) {
      msgs.push({
        lead_id: lead.id, step: "confirmation", channel: "email", recipient: emailLower,
        subject: `You're registered for the Interest Meeting on ${datePretty}!`,
        body: `Hi ${name},\n\nThank you for your heart to serve! You're registered for our Interest Meeting on ${when}.\n\nWhere: ${where}${teamsStr}\n\nThis is a relaxed, no-pressure gathering where you'll meet the team leaders and find out how to get involved.\n\nSee you there!\n— The HOTC Team`,
        scheduled_for: new Date().toISOString(),
      });
      // Day-before reminder, 10 AM
      msgs.push({
        lead_id: lead.id, step: "reminder", channel: "email", recipient: emailLower,
        subject: "Your Interest Meeting is tomorrow!",
        body: `Hi ${name},\n\nJust a friendly reminder — your Interest Meeting is tomorrow, ${when}.\n\nWhere: ${where}\n\nSee you soon!\n— The HOTC Team`,
        scheduled_for: addDays(atChurchTime(session.session_date, 10), -1).getTime() > Date.now()
          ? addDays(atChurchTime(session.session_date, 10), -1).toISOString()
          : new Date().toISOString(),
      });
      // No-show follow-up
      msgs.push({
        lead_id: lead.id, step: "no_show", channel: "email", recipient: emailLower,
        subject: "We missed you at the Interest Meeting",
        body: `Hi ${name},\n\nWe're sorry we missed you at the Interest Meeting! Life happens.\n\nIf you'd still love to get involved, just reply to this email and we'll find another time that works.\n\n— The HOTC Team`,
        scheduled_for: addDays(sessionStart, 1).toISOString(),
      });
    }
    if (input.sms_opt_in && phoneE164) {
      msgs.push({
        lead_id: lead.id, step: "confirmation", channel: "sms", recipient: phoneE164,
        body: `Hi ${name}, this is HOTC! You're registered for our Interest Meeting on ${when} at ${where}. See you there! — House of Transformation Church`,
        scheduled_for: new Date().toISOString(),
      });
      // Day-of nudge, 1 hour before
      msgs.push({
        lead_id: lead.id, step: "day_of", channel: "sms", recipient: phoneE164,
        body: `Hi ${name}! Your Interest Meeting starts in about an hour at ${where}. See you soon! — HOTC`,
        scheduled_for: new Date(sessionStart.getTime() - 3600000).toISOString(),
      });
      // No-show follow-up
      msgs.push({
        lead_id: lead.id, step: "no_show", channel: "sms", recipient: phoneE164,
        body: `Hi ${name}, we missed you at the Interest Meeting! Would you like to join the next one? Reply and we'll set it up. — HOTC`,
        scheduled_for: addDays(sessionStart, 1).toISOString(),
      });
    }

    if (msgs.length) {
      const { error: msgErr } = await supabase.from("funnel_messages").insert(msgs);
      if (msgErr) console.error("funnel message queue failed", msgErr);
    }

    return new Response(JSON.stringify({ ok: true, lead_id: lead.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("interest-meeting-submit error", e);
    return new Response(JSON.stringify({ error: "Something went wrong — please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Public endpoint for the /plan-a-visit page. Validates input, rate-limits,
// creates a funnel_leads row, and queues the automated follow-up sequence.
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
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults_count: z.number().int().min(1).max(20).default(1),
  kids_count: z.number().int().min(0).max(20).default(0),
  kids_ages: z.string().max(200).optional().default(""),
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

// Next Sunday on/after a given date string, in church tz
function atChurchTime(dateStr: string, hour: number, minute = 0): Date {
  // Build a UTC instant for dateStr at hour:minute in America/Los_Angeles
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

    // Church settings (service time, address) editable by admins
    const { data: settingsRow } = await supabase
      .from("app_settings").select("value").eq("key", "funnel_config").maybeSingle();
    const cfg = (settingsRow?.value || {}) as Record<string, any>;
    const serviceTime = cfg.service_time || "Sundays at 10:00 AM";
    const address = cfg.address || "House of Transformation Church";

    const { data: lead, error: insertErr } = await supabase
      .from("funnel_leads")
      .insert({
        first_name: input.first_name,
        last_name: input.last_name,
        email: emailLower || null,
        phone: phoneE164,
        visit_date: input.visit_date,
        adults_count: input.adults_count,
        kids_count: input.kids_count,
        kids_ages: input.kids_ages || null,
        message: input.message || null,
        sms_opt_in: input.sms_opt_in && !!phoneE164,
        sms_opt_in_at: input.sms_opt_in && phoneE164 ? new Date().toISOString() : null,
        sms_opt_in_text: input.sms_opt_in && phoneE164
          ? "Opted in via Plan a Visit form to receive visit reminders by text."
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
    const visitDatePretty = new Date(`${input.visit_date}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    const msgs: Array<Record<string, unknown>> = [];

    if (emailLower) {
      msgs.push({
        lead_id: lead.id, step: "confirmation", channel: "email", recipient: emailLower,
        subject: `You're all set for ${visitDatePretty}!`,
        body: `Hi ${name},\n\nWe're so glad you're planning to visit us on ${visitDatePretty}! Service starts ${serviceTime}.\n\nWhere: ${address}\n\nWhen you arrive, just tell a greeter it's your first time — they'll take care of you.${input.kids_count > 0 ? "\n\nKids check-in opens 20 minutes before service, and our team will help you get your little ones settled." : ""}\n\nSee you soon!\n— The HOTC Team`,
        scheduled_for: new Date().toISOString(),
      });
      // Saturday reminder (day before, 10 AM)
      msgs.push({
        lead_id: lead.id, step: "reminder", channel: "email", recipient: emailLower,
        subject: "Looking forward to seeing you tomorrow!",
        body: `Hi ${name},\n\nJust a friendly reminder — we're expecting you tomorrow, ${visitDatePretty}, ${serviceTime}.\n\nWhere: ${address}\n\nSee you in the morning!\n— The HOTC Team`,
        scheduled_for: atChurchTime(input.visit_date, 10).getTime() - 86400000 > Date.now()
          ? addDays(atChurchTime(input.visit_date, 10), -1).toISOString()
          : new Date().toISOString(),
      });
    }
    if (input.sms_opt_in && phoneE164) {
      msgs.push({
        lead_id: lead.id, step: "confirmation", channel: "sms", recipient: phoneE164,
        body: `Hi ${name}, this is HOTC! You're confirmed for ${visitDatePretty}, ${serviceTime}. We can't wait to meet you! — House of Transformation Church`,
        scheduled_for: new Date().toISOString(),
      });
      // Sunday-morning nudge, 8 AM
      msgs.push({
        lead_id: lead.id, step: "day_of", channel: "sms", recipient: phoneE164,
        body: `Good morning ${name}! See you today ${serviceTime} at ${address}. Reply with any questions! — HOTC`,
        scheduled_for: atChurchTime(input.visit_date, 8).toISOString(),
      });
      // Monday no-show follow-up (cancelled automatically if marked attended)
      msgs.push({
        lead_id: lead.id, step: "no_show", channel: "sms", recipient: phoneE164,
        body: `Hi ${name}, we missed you on Sunday! No worries — would you like to pick another Sunday? We'd still love to meet you. — HOTC`,
        scheduled_for: addDays(atChurchTime(input.visit_date, 10), 1).toISOString(),
      });
    }
    if (emailLower) {
      msgs.push({
        lead_id: lead.id, step: "no_show", channel: "email", recipient: emailLower,
        subject: "We missed you on Sunday",
        body: `Hi ${name},\n\nWe had a seat saved for you on ${visitDatePretty} and we're sorry we missed you! Life happens.\n\nIf you'd like to plan another visit, just reply to this email and we'll set it up.\n\n— The HOTC Team`,
        scheduled_for: addDays(atChurchTime(input.visit_date, 10), 1).toISOString(),
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
    console.error("plan-visit-submit error", e);
    return new Response(JSON.stringify({ error: "Something went wrong — please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

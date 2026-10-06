// Public registration endpoint for any published event. Validation rules come from the
// event's form_config; follow-ups come from the event's workflow steps + Comms templates.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { churchDateStr, queueEventWorkflow } from "../_shared/eventWorkflow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  slug: z.string().trim().min(1).max(120),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  team_ids: z.array(z.string().uuid()).max(15).optional().default([]),
  message: z.string().max(2000).optional().default(""),
  answers: z.record(z.string().max(2000)).optional().default({}),
  sms_opt_in: z.boolean().default(false),
  utm_source: z.string().max(120).optional().default(""),
  utm_medium: z.string().max(120).optional().default(""),
  utm_campaign: z.string().max(120).optional().default(""),
  utm_content: z.string().max(120).optional().default(""),
  website: z.string().optional().default(""),
});

function normalizePhone(p: string): string | null {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d.length >= 8 ? `+${d}` : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Please check the form fields and try again." }, 400);
    const input = parsed.data;
    if (input.website) return json({ ok: true });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: event } = await sb.from("events").select("*")
      .eq("slug", input.slug).eq("status", "published").eq("is_template", false).maybeSingle();
    if (!event) return json({ error: "This event isn't open for registration." }, 404);

    const cfg = event.form_config || {};
    const phoneE164 = input.phone ? normalizePhone(input.phone) : null;
    const emailLower = input.email.toLowerCase();
    if (emailLower && !z.string().email().safeParse(emailLower).success) return json({ error: "Please enter a valid email." }, 400);
    if (cfg.require_last_name && !input.last_name) return json({ error: "Last name is required." }, 400);
    if (cfg.require_email && !emailLower) return json({ error: "Email is required." }, 400);
    if (cfg.require_phone && !phoneE164) return json({ error: "A valid phone number is required." }, 400);
    if (!emailLower && !phoneE164) return json({ error: "Please provide an email or phone number." }, 400);

    // Rate limit: 5 per phone/email per day
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const clauses: string[] = [];
    if (emailLower) clauses.push(`email.ilike.${emailLower}`);
    if (phoneE164) clauses.push(`phone.eq.${phoneE164}`);
    const { count } = await sb.from("funnel_leads").select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo).or(clauses.join(","));
    if ((count ?? 0) >= 5) return json({ error: "You've already registered recently — we'll be in touch soon!" }, 429);

    const optIn = input.sms_opt_in && !!phoneE164;
    const now = new Date();
    const tags = [`event:${event.slug}`, `registrant:${event.lead_type}`, `registered:${now.toISOString().slice(0, 7)}`];
    const { data: lead, error } = await sb.from("funnel_leads").insert({
      first_name: input.first_name, last_name: input.last_name || "",
      email: emailLower || null, phone: phoneE164,
      lead_type: event.lead_type, event_id: event.id, tags,
      visit_date: event.start_at ? churchDateStr(new Date(event.start_at)) : churchDateStr(now),
      preferred_team_ids: input.team_ids, message: input.message || null,
      custom_answers: input.answers,
      sms_opt_in: optIn, sms_opt_in_at: optIn ? now.toISOString() : null,
      sms_opt_in_text: optIn ? (cfg.sms_consent_text || `Opted in via ${event.name} registration to receive texts.`) : null,
      utm_source: input.utm_source || null, utm_medium: input.utm_medium || null,
      utm_campaign: input.utm_campaign || null, utm_content: input.utm_content || null,
    }).select("*").single();
    if (error) throw error;

    await queueEventWorkflow(sb, event, lead);
    // Kick the dispatcher so "immediately" steps go out now.
    sb.functions.invoke("dispatch-funnel-messages", { body: {} }).catch(() => {});
    return json({ ok: true, lead_id: lead.id });
  } catch (e) {
    console.error("event-register error", e);
    return json({ error: "Something went wrong — please try again." }, 500);
  }
});

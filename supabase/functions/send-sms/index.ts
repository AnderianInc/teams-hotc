import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function normalizePhone(raw: string): string {
  let phone = String(raw).trim();
  if (!phone.startsWith("+")) {
    const digits = phone.replace(/\D/g, "");
    phone = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  }
  return phone;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const FROM = Deno.env.get("TWILIO_FROM_NUMBER");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY not configured");
    if (!FROM) throw new Error("TWILIO_FROM_NUMBER not configured");

    const { to, body, to_name, related_attendee_id, logged_by, override_consent, consent_note } = await req.json();
    if (!to || !body) throw new Error("Missing 'to' or 'body'");

    const phone = normalizePhone(to);

    // Consent enforcement: refuse to send unless we have a recorded opt-in for this number,
    // OR the caller explicitly overrides (e.g., the volunteer recorded verbal consent and provides a note).
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let consentSource: string | null = null;
    if (related_attendee_id) {
      const { data: a } = await supabase
        .from("attendees")
        .select("sms_opt_in, sms_opt_in_source")
        .eq("id", related_attendee_id)
        .maybeSingle();
      if (a?.sms_opt_in) consentSource = a.sms_opt_in_source ?? "attendee_record";
    }
    if (!consentSource) {
      // Try to match by phone in attendees, then profiles
      const digits = phone.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      const { data: byPhone } = await supabase
        .from("attendees")
        .select("sms_opt_in, sms_opt_in_source, phone")
        .eq("sms_opt_in", true)
        .limit(50);
      const matched = (byPhone ?? []).find(
        (r: any) => (r.phone || "").replace(/\D/g, "").slice(-10) === last10,
      );
      if (matched) consentSource = matched.sms_opt_in_source ?? "attendee_phone_match";
    }
    if (!consentSource) {
      const digits = phone.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      const { data: byProfile } = await supabase
        .from("profiles")
        .select("sms_opt_in, sms_opt_in_source, phone")
        .eq("sms_opt_in", true)
        .limit(50);
      const matchedP = (byProfile ?? []).find(
        (r: any) => (r.phone || "").replace(/\D/g, "").slice(-10) === last10,
      );
      if (matchedP) consentSource = matchedP.sms_opt_in_source ?? "profile_phone_match";
    }

    if (!consentSource && !override_consent) {
      return new Response(
        JSON.stringify({
          error:
            "No SMS opt-in on record for this number. Capture consent first (Welcome form, Connect card, or verbal opt-in with override + note).",
          code: "NO_CONSENT",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Append legally-required compliance footer for the first message in a session.
    // Keep idempotent — only append if not already present.
    let outBody = String(body).slice(0, 1500);
    if (!/STOP/i.test(outBody)) {
      outBody = `${outBody}\n\nReply STOP to unsubscribe.`;
    }

    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: FROM, Body: outBody.slice(0, 1600) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Twilio error [${res.status}]: ${data.message || JSON.stringify(data)}`);

    try {
      await supabase.from("sms_log").insert({
        to_phone: phone,
        to_name: to_name || null,
        body: outBody,
        related_attendee_id: related_attendee_id || null,
        sent_by: logged_by || null,
        status: "sent",
        provider_message_id: data.sid || null,
        error: override_consent && consent_note ? `consent: override — ${consent_note}` : null,
      });
    } catch (e) { console.error("sms log failed", e); }

    return new Response(JSON.stringify({ success: true, sid: data.sid, consent_source: consentSource ?? "override" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

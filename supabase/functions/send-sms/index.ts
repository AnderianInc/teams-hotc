import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const FROM = Deno.env.get("TWILIO_FROM_NUMBER");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY not configured");
    if (!FROM) throw new Error("TWILIO_FROM_NUMBER not configured");

    const { to, body, to_name, related_attendee_id, logged_by } = await req.json();
    if (!to || !body) throw new Error("Missing 'to' or 'body'");

    // Normalize phone to E.164 (assume US if no +)
    let phone = String(to).trim();
    if (!phone.startsWith("+")) {
      const digits = phone.replace(/\D/g, "");
      phone = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    }

    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: FROM, Body: String(body).slice(0, 1600) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Twilio error [${res.status}]: ${data.message || JSON.stringify(data)}`);

    // Log
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supabase.from("sms_log").insert({
        to_phone: phone,
        to_name: to_name || null,
        body,
        related_attendee_id: related_attendee_id || null,
        sent_by: logged_by || null,
        status: "sent",
        provider_message_id: data.sid || null,
      });
    } catch (e) { console.error("sms log failed", e); }

    return new Response(JSON.stringify({ success: true, sid: data.sid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

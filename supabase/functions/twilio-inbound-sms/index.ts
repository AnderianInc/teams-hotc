import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Twilio posts application/x-www-form-urlencoded with fields like:
// From, To, Body, MessageSid, NumMedia, MediaUrl0..N
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let params: URLSearchParams;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      params = new URLSearchParams(await req.text());
    } else if (ct.includes("application/json")) {
      const j = await req.json();
      params = new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)]));
    } else {
      params = new URLSearchParams(await req.text());
    }

    const from = params.get("From") ?? "";
    const to = params.get("To") ?? "";
    const body = params.get("Body") ?? "";
    const sid = params.get("MessageSid") ?? params.get("SmsSid") ?? null;
    const numMedia = parseInt(params.get("NumMedia") ?? "0", 10) || 0;
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const u = params.get(`MediaUrl${i}`);
      if (u) mediaUrls.push(u);
    }

    if (!from || !body) {
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Try to match attendee/profile by phone (last 10 digits)
    const last10 = from.replace(/\D/g, "").slice(-10);
    let related_attendee_id: string | null = null;
    let from_name: string | null = null;
    if (last10) {
      const { data: a } = await supabase
        .from("attendees")
        .select("id, first_name, last_name, phone")
        .limit(200);
      const ma = (a ?? []).find(
        (r: any) => (r.phone || "").replace(/\D/g, "").slice(-10) === last10,
      );
      if (ma) {
        related_attendee_id = ma.id;
        from_name = [ma.first_name, ma.last_name].filter(Boolean).join(" ") || null;
      } else {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .limit(200);
        const mp = (p ?? []).find(
          (r: any) => (r.phone || "").replace(/\D/g, "").slice(-10) === last10,
        );
        if (mp) from_name = mp.full_name ?? null;
      }
    }

    // Handle STOP / UNSUBSCRIBE keywords — record do_not_contact + persistent opt-out
    const upper = body.trim().toUpperCase();
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(upper)) {
      if (last10) {
        // Persistent global block — survives even if attendee/profile is later edited or deleted
        await supabase.from("sms_opt_outs").upsert(
          {
            phone_e164: from,
            phone_last10: last10,
            reason: `Inbound keyword: ${upper}`,
            source: "inbound_stop",
            opted_out_at: new Date().toISOString(),
          },
          { onConflict: "phone_last10" },
        );

        // Best-effort updates by phone last 10 digits
        const { data: aMatches } = await supabase
          .from("attendees").select("id, phone").limit(500);
        for (const r of aMatches ?? []) {
          if ((r.phone || "").replace(/\D/g, "").slice(-10) === last10) {
            await supabase.from("attendees").update({ do_not_contact: true, sms_opt_in: false }).eq("id", r.id);
          }
        }
        const { data: pMatches } = await supabase
          .from("profiles").select("id, phone").limit(500);
        for (const r of pMatches ?? []) {
          if ((r.phone || "").replace(/\D/g, "").slice(-10) === last10) {
            await supabase.from("profiles").update({ do_not_contact: true, sms_opt_in: false }).eq("id", r.id);
          }
        }
      }
    }

    await supabase.from("sms_inbound").insert({
      from_phone: from,
      to_phone: to,
      body,
      num_media: numMedia,
      media_urls: mediaUrls,
      provider_message_id: sid,
      related_attendee_id,
      from_name,
      status: "new",
    });

    // Respond with empty TwiML so Twilio doesn't auto-reply
    return new Response("<Response/>", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (e: any) {
    console.error("twilio-inbound-sms error", e);
    return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }
});

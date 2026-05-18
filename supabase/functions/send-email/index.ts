import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const { to, subject, html, text, logged_by, to_name, related_attendee_id } = await req.json();
    if (!to || !subject) throw new Error("Missing 'to' or 'subject'");

    // Do-not-contact enforcement
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const toEmail = Array.isArray(to) ? to[0] : to;
      let blocked = false;
      if (related_attendee_id) {
        const { data: a } = await sb.from("attendees").select("do_not_contact").eq("id", related_attendee_id).maybeSingle();
        if (a?.do_not_contact) blocked = true;
      }
      if (!blocked && toEmail) {
        const { data: a2 } = await sb.from("attendees").select("do_not_contact").eq("email", toEmail).limit(1);
        if (a2?.some((r: any) => r.do_not_contact)) blocked = true;
        if (!blocked) {
          const { data: p } = await sb.from("profiles").select("do_not_contact").eq("email", toEmail).limit(1);
          if (p?.some((r: any) => r.do_not_contact)) blocked = true;
        }
      }
      if (blocked) {
        return new Response(JSON.stringify({ error: "Contact has do-not-contact set", code: "DO_NOT_CONTACT" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.error("DNC check failed", e);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HOTC <contact@hotc.life>",
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || undefined,
        text: text || undefined,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message || JSON.stringify(result));

    // Log email if logged_by is provided
    if (logged_by) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from("email_log").insert({
          to_email: Array.isArray(to) ? to[0] : to,
          to_name: to_name || null,
          subject,
          body_html: html || null,
          sent_by: logged_by,
          related_attendee_id: related_attendee_id || null,
          status: "sent",
        });
      } catch (logErr) {
        console.error("Failed to log email:", logErr);
      }
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

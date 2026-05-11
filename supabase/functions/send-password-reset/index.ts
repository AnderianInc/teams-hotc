import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, redirectTo } = await req.json();
    if (!email) throw new Error("Email is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const admin = createClient(supabaseUrl, serviceKey);

    // Generate the recovery link via admin API (does not send email itself)
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: redirectTo || undefined },
    });
    if (error) {
      // Don't leak whether the email exists
      console.error("generateLink error:", error.message);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = data.properties?.action_link;
    if (!actionLink) throw new Error("No action link returned");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">Reset your HOTC password</h2>
        <p>We received a request to reset the password for your HOTC Volunteer Hub account.</p>
        <p style="margin: 24px 0;">
          <a href="${actionLink}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
            Reset password
          </a>
        </p>
        <p style="font-size: 13px; color:#555;">Or copy this link into your browser:<br/>
          <a href="${actionLink}">${actionLink}</a>
        </p>
        <p style="font-size: 12px; color:#888; margin-top:32px;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <p style="font-size: 12px; color:#888;">— House of Transformation Church</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HOTC <contact@hotc.life>",
        to: [email],
        subject: "Reset your HOTC password",
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message || JSON.stringify(result));

    // Best-effort log
    try {
      await admin.from("email_log").insert({
        to_email: email,
        subject: "Reset your HOTC password",
        body_html: html,
        status: "sent",
      });
    } catch (_) {}

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-password-reset error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeBody(html: string): string {
  const trimmed = (html || "").trim();
  if (!trimmed) return "";
  // If author already supplied a full doc, leave it alone
  if (/<html[\s>]/i.test(trimmed) || /<!doctype/i.test(trimmed)) return trimmed;
  // If content has no block tags, split on blank lines into paragraphs
  if (!/<(p|div|h[1-6]|ul|ol|table|blockquote|br)[\s>]/i.test(trimmed)) {
    return trimmed
      .split(/\n{2,}/)
      .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
      .join("\n");
  }
  return trimmed;
}

function wrapTemplate(innerHtml: string, subject: string): string {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${subject.replace(/[<>&]/g, "")}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td style="background-color:#0f172a;padding:24px 32px;">
            <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">House of Transformation Church</div>
            <div style="color:#94a3b8;font-size:12px;margin-top:2px;">HOTC Volunteer & Community Hub</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;line-height:1.6;color:#1f2937;">
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;line-height:1.5;">
            <div style="margin-bottom:6px;">Sent with care from House of Transformation Church.</div>
            <div>
              <a href="https://www.hotc.life" style="color:#0ea5e9;text-decoration:none;">hotc.life</a>
              &nbsp;·&nbsp; <a href="https://teams.hotc.life" style="color:#0ea5e9;text-decoration:none;">teams.hotc.life</a>
            </div>
            <div style="margin-top:10px;color:#94a3b8;">© ${year} House of Transformation Church. If this message reached you in error, simply reply and let us know.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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

    const finalHtml = html ? wrapTemplate(normalizeBody(html), subject) : undefined;

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
        html: finalHtml,
        text: text || undefined,
        reply_to: "contact@hotc.life",
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

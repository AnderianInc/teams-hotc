import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { marked } from "https://esm.sh/marked@12.0.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_BASE = "https://teams.hotc.life";

function looksLikeHtml(s: string): boolean {
  return /<(p|div|h[1-6]|ul|ol|table|blockquote|br|a|img|span|strong|em)[\s>]/i.test(s);
}

function normalizeBody(html: string): string {
  const trimmed = (html || "").trim();
  if (!trimmed) return "";
  if (/<html[\s>]/i.test(trimmed) || /<!doctype/i.test(trimmed)) return trimmed;
  // If it already contains common HTML tags, leave it alone
  if (looksLikeHtml(trimmed)) return trimmed;
  // Otherwise treat input as Markdown (also handles plain text gracefully)
  try {
    const rendered = marked.parse(trimmed, { breaks: true, gfm: true }) as string;
    return rendered;
  } catch {
    return trimmed
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br />")}</p>`)
      .join("\n");
  }
}

function wrapTemplate(innerHtml: string, subject: string, unsubscribeUrl?: string): string {
  const year = new Date().getFullYear();
  const unsubBlock = unsubscribeUrl
    ? `<div style="margin-top:10px;"><a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe from these emails</a></div>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${subject.replace(/[<>&]/g, "")}</title>
<style>
  .hotc-content h1{font-size:22px;margin:0 0 12px;font-weight:700;color:#0f172a;}
  .hotc-content h2{font-size:18px;margin:20px 0 10px;font-weight:700;color:#0f172a;}
  .hotc-content h3{font-size:16px;margin:18px 0 8px;font-weight:600;color:#0f172a;}
  .hotc-content p{margin:0 0 12px;}
  .hotc-content ul,.hotc-content ol{margin:0 0 12px 22px;padding:0;}
  .hotc-content li{margin:4px 0;}
  .hotc-content a{color:#0ea5e9;text-decoration:underline;}
  .hotc-content blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid #cbd5e1;color:#475569;background:#f8fafc;}
  .hotc-content code{background:#f1f5f9;padding:2px 5px;border-radius:4px;font-size:13px;}
  .hotc-content hr{border:0;border-top:1px solid #e5e7eb;margin:18px 0;}
  .hotc-content img{max-width:100%;height:auto;border-radius:8px;}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td style="background-color:#0f172a;padding:24px 32px;">
            <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">House of Transformation Church</div>
            <div style="color:#94a3b8;font-size:12px;margin-top:2px;">HOTC Volunteer &amp; Community Hub</div>
          </td>
        </tr>
        <tr>
          <td class="hotc-content" style="padding:32px;font-size:15px;line-height:1.6;color:#1f2937;">
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
            <div style="margin-top:10px;color:#94a3b8;">© ${year} House of Transformation Church.</div>
            ${unsubBlock}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function getOrCreateUnsubToken(sb: any, email: string): Promise<string | null> {
  try {
    const lower = email.trim().toLowerCase();
    const { data: existing } = await sb.from("email_unsubscribes").select("token, unsubscribed_at").eq("email", lower).maybeSingle();
    if (existing) {
      if (existing.unsubscribed_at) return null; // already unsubscribed -> block
      return existing.token;
    }
    const { data: inserted } = await sb.from("email_unsubscribes").insert({ email: lower }).select("token").single();
    return inserted?.token ?? null;
  } catch (e) {
    console.error("unsub token error", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const { to, subject, html, text, logged_by, to_name, related_attendee_id } = await req.json();
    if (!to || !subject) throw new Error("Missing 'to' or 'subject'");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const toEmail = (Array.isArray(to) ? to[0] : to).trim().toLowerCase();

    // Do-not-contact + unsubscribe enforcement
    let blocked = false;
    try {
      if (related_attendee_id) {
        const { data: a } = await sb.from("attendees").select("do_not_contact").eq("id", related_attendee_id).maybeSingle();
        if (a?.do_not_contact) blocked = true;
      }
      if (!blocked) {
        const { data: a2 } = await sb.from("attendees").select("do_not_contact").eq("email", toEmail).limit(1);
        if (a2?.some((r: any) => r.do_not_contact)) blocked = true;
      }
      if (!blocked) {
        const { data: p } = await sb.from("profiles").select("do_not_contact").eq("email", toEmail).limit(1);
        if (p?.some((r: any) => r.do_not_contact)) blocked = true;
      }
      if (!blocked) {
        const { data: u } = await sb.from("email_unsubscribes").select("unsubscribed_at").eq("email", toEmail).maybeSingle();
        if (u?.unsubscribed_at) blocked = true;
      }
    } catch (e) {
      console.error("DNC check failed", e);
    }
    if (blocked) {
      return new Response(JSON.stringify({ error: "Recipient has opted out", code: "DO_NOT_CONTACT" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unsubToken = await getOrCreateUnsubToken(sb, toEmail);
    const unsubscribeUrl = unsubToken ? `${PUBLIC_BASE}/unsubscribe?token=${unsubToken}` : undefined;

    const finalHtml = html ? wrapTemplate(normalizeBody(html), subject, unsubscribeUrl) : undefined;

    const headersExtra: Record<string, string> = {};
    if (unsubscribeUrl) {
      headersExtra["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
      headersExtra["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "HOTC <community@hotc.life>",
        to: Array.isArray(to) ? to : [to],
        subject,
        html: finalHtml,
        text: text || undefined,
        reply_to: "community@hotc.life",
        headers: Object.keys(headersExtra).length ? headersExtra : undefined,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      const errMsg = result.message || JSON.stringify(result);
      if (logged_by) {
        try {
          await sb.from("email_log").insert({
            to_email: toEmail,
            to_name: to_name || null,
            subject,
            body_html: html || null,
            sent_by: logged_by,
            related_attendee_id: related_attendee_id || null,
            status: "failed",
            error: errMsg.slice(0, 1000),
          });
        } catch {}
      }
      throw new Error(errMsg);
    }

    if (logged_by) {
      try {
        await sb.from("email_log").insert({
          to_email: toEmail,
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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

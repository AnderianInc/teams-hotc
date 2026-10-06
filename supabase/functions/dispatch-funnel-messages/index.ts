// Sends due funnel_messages (Plan a Visit follow-ups). Runs every 15 min via pg_cron.
// Retries transient failures up to 3 times; terminal failures (opt-out, no consent) stop immediately.
import { createClient } from "npm:@supabase/supabase-js@2";
import { eventContext, render } from "../_shared/eventWorkflow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const isTerminal = (msg: string) =>
  /DO_NOT_CONTACT|SMS_OPT_OUT|NO_CONSENT|opted out|unsubscribed|INVALID/i.test(msg);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: due, error } = await sb
      .from("funnel_messages")
      .select("*, funnel_leads!inner(status, sms_opt_in, sms_opt_in_at, first_name, last_name, preferred_team_ids)")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for")
      .limit(50);
    if (error) throw error;

    let sent = 0, failed = 0, retried = 0, cancelled = 0;

    for (const row of due ?? []) {
      // Skip messages for leads already attended/cancelled
      const lead = (row as any).funnel_leads;
      const leadStatus = lead?.status;
      if (leadStatus === "attended" || leadStatus === "cancelled") {
        await sb.from("funnel_messages").update({ status: "cancelled" }).eq("id", row.id);
        cancelled++;
        continue;
      }
      try {
        const fnName = row.channel === "email" ? "send-email" : "send-sms";
        // Consent for funnel texts lives on funnel_leads (leads aren't in the directory yet).
        // STOP/opt-out and do-not-contact are still enforced by send-sms and cannot be overridden.
        if (row.channel === "sms" && !lead?.sms_opt_in) {
          throw new Error("NO_CONSENT: lead did not opt in to texts");
        }
        let subject = row.subject;
        let text = row.body || "";
        if (row.template_id) {
          // Render from the admin-editable Comms template at send time.
          const tbl = row.channel === "email" ? "email_templates" : "sms_templates";
          const { data: tpl } = await sb.from(tbl).select("*").eq("id", row.template_id).maybeSingle();
          if (!tpl) throw new Error("INVALID: template was deleted");
          const { data: ev } = row.event_id
            ? await sb.from("events").select("*").eq("id", row.event_id).maybeSingle()
            : { data: null };
          let teamNames: string[] = [];
          if (lead?.preferred_team_ids?.length) {
            const { data: t } = await sb.from("teams").select("name").in("id", lead.preferred_team_ids);
            teamNames = (t || []).map((x: any) => x.name);
          }
          const ctx = eventContext(ev, lead, teamNames);
          if (row.channel === "email") { subject = render(tpl.subject, ctx, true); text = render(tpl.body_html, ctx); }
          else text = render(tpl.body, ctx, true);
          await sb.from("funnel_messages").update({ subject, body: text }).eq("id", row.id);
        }
        const body = row.channel === "email"
          ? { to: row.recipient, subject, html: row.template_id ? text : text.replace(/\n/g, "<br/>") }
          : {
              to: row.recipient, body: text, override_consent: true,
              consent_note: `Event registration opt-in${lead?.sms_opt_in_at ? ` at ${lead.sms_opt_in_at}` : ""}`,
            };
        const res = await sb.functions.invoke(fnName, { body });
        if (res.error || (res.data as any)?.error) {
          throw new Error(res.error?.message || (res.data as any)?.error);
        }
        await sb.from("funnel_messages").update({
          status: "sent", sent_at: new Date().toISOString(), error: null,
        }).eq("id", row.id);
        sent++;
      } catch (e) {
        const msg = (e as Error).message;
        const attempts = (row.attempts ?? 0) + 1;
        if (!isTerminal(msg) && attempts < MAX_ATTEMPTS) {
          await sb.from("funnel_messages").update({
            attempts,
            scheduled_for: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            error: msg,
          }).eq("id", row.id);
          retried++;
        } else {
          await sb.from("funnel_messages").update({
            status: "failed", attempts, error: msg,
          }).eq("id", row.id);
          failed++;
        }
      }
    }

    return new Response(JSON.stringify({ processed: due?.length ?? 0, sent, failed, retried, cancelled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Sends due funnel_messages (Plan a Visit follow-ups). Runs every 15 min via pg_cron.
// Retries transient failures up to 3 times; terminal failures (opt-out, no consent) stop immediately.
import { createClient } from "npm:@supabase/supabase-js@2";

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
      .select("*, funnel_leads!inner(status)")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for")
      .limit(50);
    if (error) throw error;

    let sent = 0, failed = 0, retried = 0, cancelled = 0;

    for (const row of due ?? []) {
      // Skip messages for leads already attended/cancelled
      const leadStatus = (row as any).funnel_leads?.status;
      if (leadStatus === "attended" || leadStatus === "cancelled") {
        await sb.from("funnel_messages").update({ status: "cancelled" }).eq("id", row.id);
        cancelled++;
        continue;
      }
      // No-show messages only make sense if the visit date passed without attendance;
      // reminders only before the visit.
      try {
        const fnName = row.channel === "email" ? "send-email" : "send-sms";
        const body = row.channel === "email"
          ? { to: row.recipient, subject: row.subject, html: (row.body || "").replace(/\n/g, "<br/>") }
          : { to: row.recipient, body: row.body };
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

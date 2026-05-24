// Approves or rejects a pending outreach_sequence_runs row. Approve = send via
// send-email/send-sms and mark sent. Reject = mark skipped with a reason.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }
  const userId = claims.claims.sub as string;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const { run_id, action, reason, mode } = body as {
    run_id?: string;
    action?: "approve" | "reject";
    reason?: string;
    mode?: "queue" | "now";
  };
  if (!run_id || !["approve", "reject"].includes(action || "")) {
    return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: corsHeaders });
  }

  const { data: run } = await admin
    .from("outreach_sequence_runs")
    .select("*")
    .eq("id", run_id)
    .maybeSingle();
  if (!run) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
  if (run.status !== "pending_approval") {
    return new Response(JSON.stringify({ error: "Already actioned" }), { status: 409, headers: corsHeaders });
  }

  if (action === "reject") {
    await admin.from("outreach_sequence_runs").update({
      status: "skipped",
      detail: reason || "rejected by reviewer",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }).eq("id", run_id);
    return new Response(JSON.stringify({ ok: true, status: "skipped" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // approve
  const { data: rec } = await admin
    .from("external_records")
    .select("id, attendee_id, source")
    .eq("id", run.external_record_id)
    .maybeSingle();

  // If scheduled for the future, mark approved and let dispatcher send at due time
  const scheduledMs = run.scheduled_for ? new Date(run.scheduled_for).getTime() : 0;
  if (scheduledMs && scheduledMs > Date.now()) {
    await admin.from("outreach_sequence_runs").update({
      status: "approved",
      detail: null,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }).eq("id", run_id);
    return new Response(JSON.stringify({ ok: true, status: "approved", scheduled_for: run.scheduled_for }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sendErr: string | null = null;
  try {
    if (run.channel === "email") {
      await admin.functions.invoke("send-email", {
        body: { to: run.recipient, subject: run.subject, html: (run.body || "").replace(/\n/g, "<br/>"), related_attendee_id: rec?.attendee_id },
      });
    } else if (run.channel === "sms") {
      await admin.functions.invoke("send-sms", {
        body: { to: run.recipient, body: run.body, related_attendee_id: rec?.attendee_id },
      });
    } else {
      sendErr = "unsupported channel";
    }
  } catch (e) {
    sendErr = e instanceof Error ? e.message : String(e);
  }

  await admin.from("outreach_sequence_runs").update({
    status: sendErr ? "failed" : "sent",
    detail: sendErr,
    approved_by: userId,
    approved_at: new Date().toISOString(),
  }).eq("id", run_id);

  if (!sendErr && rec?.attendee_id) {
    // Mirror the send on the FI follow-up queue
    try {
      await admin
        .from("follow_ups")
        .update({ status: "contacted" })
        .eq("attendee_id", rec.attendee_id)
        .eq("type", "outreach")
        .eq("status", "pending");
    } catch (e) { console.error("follow_up status update failed", e); }

    if (rec.source === "interest") {
      try { await admin.rpc("advance_interest_pipeline", { _attendee_id: rec.attendee_id }); } catch (e) { console.error(e); }
    }
  }

  return new Response(JSON.stringify({ ok: !sendErr, status: sendErr ? "failed" : "sent", error: sendErr }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

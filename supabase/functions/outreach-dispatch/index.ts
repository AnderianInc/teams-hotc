// Runs hourly via pg_cron. For each due outreach_sequences step + external_record,
// it renders the message. If the step requires approval, it queues a
// `pending_approval` row in outreach_sequence_runs. Otherwise it sends immediately.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Seq = {
  id: string;
  source: string;
  step_order: number;
  offset_days: number;
  anchor: "received" | "event_date";
  channel: "email" | "sms" | "task";
  template_slug: string | null;
  audience: "requester" | "fi_team";
  description: string | null;
  requires_approval: boolean;
  subject_override: string | null;
  body_override: string | null;
};

function applyVars(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => ctx[k] ?? "");
}

const FI_TEAM_EMAIL = "firstimpressions@hotc.life";

function renderTemplate(slug: string | null, ctx: Record<string, string>): { subject: string; body: string } {
  const name = ctx.first_name || "Friend";
  const ev = ctx.event_date ? new Date(ctx.event_date).toLocaleDateString() : "";
  const map: Record<string, { subject: string; body: string }> = {
    "prayer-alert-fi": { subject: "New prayer request received", body: `A new prayer request has come in from ${name}.\n\nDetails: ${ctx.notes || ""}\n\nPlease follow up promptly.` },
    "prayer-ack-requester": { subject: "We're praying for you", body: `Hi ${name}, we received your prayer request and our team is praying for you. — HOTC` },
    "prayer-checkin-d3": { subject: "Checking in", body: `Hi ${name}, just checking in — still praying with you. Anything we can help with? — HOTC` },
    "prayer-invite-meeting": { subject: "You're invited to our prayer meeting", body: `Hi ${name},\n\nWe'd love to have you join our next prayer gathering. Reply to this email for details.\n\n— HOTC` },
    "visit-ack-requester": { subject: "Thank you for requesting a visit", body: `Hi ${name},\n\nWe received your visit request and a member of our team will be in touch shortly to coordinate.\n\n— HOTC` },
    "visit-alert-fi": { subject: "New visit request received", body: `A visit request from ${name} just arrived. Please coordinate pickup/visit details.\n\nNotes: ${ctx.notes || ""}` },
    "visit-pickup-confirm": { subject: "Pickup confirmation", body: `Hi ${name}, this is HOTC confirming your visit. We'll send pickup details shortly.` },
    "interest-ack-sms": { subject: "Interest meeting confirmed", body: `Hi ${name}, you're confirmed for our interest meeting${ev ? ` on ${ev}` : ""}. — HOTC` },
    "interest-ack-email": { subject: "Interest meeting confirmed", body: `Hi ${name},\n\nThanks for your interest! You're confirmed for our meeting${ev ? ` on ${ev}` : ""}. We'll send reminders as the date approaches.\n\n— HOTC` },
    "interest-reminder-7d": { subject: "1 week until our meeting", body: `Hi ${name}, just a heads-up — your interest meeting is one week away${ev ? ` (${ev})` : ""}.` },
    "interest-reminder-2d": { subject: "2 days to go", body: `Hi ${name}, your interest meeting is in 2 days${ev ? ` (${ev})` : ""}.` },
    "interest-reminder-1d-email": { subject: "Tomorrow's meeting", body: `Hi ${name}, looking forward to seeing you tomorrow${ev ? ` (${ev})` : ""}.` },
    "interest-reminder-1d-sms": { subject: "Tomorrow", body: `Hi ${name}, see you tomorrow${ev ? ` (${ev})` : ""}! — HOTC` },
    "interest-day-of-email": { subject: "Today's the day", body: `Hi ${name}, looking forward to seeing you today. — HOTC` },
    "interest-day-of-sms": { subject: "Today", body: `Hi ${name}, see you today! — HOTC` },
  };
  return map[slug || ""] || { subject: "HOTC update", body: `Hi ${name}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: sequences = [] } = await supabase
    .from("outreach_sequences")
    .select("*")
    .eq("active", true)
    .order("step_order");

  const { data: records = [] } = await supabase
    .from("external_records")
    .select("id, source, attendee_id, received_at, event_date, payload, status")
    .in("status", ["created", "merged"]);

  let queued = 0;
  let dispatched = 0;
  let skipped = 0;

  for (const rec of records || []) {
    const seqs = (sequences as Seq[]).filter((s) => s.source === rec.source);

    const { data: runs = [] } = await supabase
      .from("outreach_sequence_runs")
      .select("sequence_id")
      .eq("external_record_id", rec.id);
    const ranIds = new Set((runs || []).map((r: any) => r.sequence_id));

    const { data: attendee } = rec.attendee_id
      ? await supabase
          .from("attendees")
          .select("id, first_name, last_name, email, phone, sms_opt_in")
          .eq("id", rec.attendee_id)
          .maybeSingle()
      : { data: null };

    for (const seq of seqs) {
      if (ranIds.has(seq.id)) continue;
      const anchorDate = seq.anchor === "event_date" ? rec.event_date : rec.received_at;
      if (!anchorDate) continue;
      const dueAt = new Date(anchorDate).getTime() + seq.offset_days * 86400000;
      if (Date.now() < dueAt) continue;

      const baseTpl = renderTemplate(seq.template_slug, {
        first_name: attendee?.first_name || "",
        notes: (rec.payload as any)?.notes || (rec.payload as any)?.message || "",
        event_date: rec.event_date || "",
      });
      const ctx = {
        first_name: attendee?.first_name || "",
        notes: (rec.payload as any)?.notes || (rec.payload as any)?.message || "",
        event_date: rec.event_date || "",
      };
      const tpl = {
        subject: seq.subject_override ? applyVars(seq.subject_override, ctx) : baseTpl.subject,
        body: seq.body_override ? applyVars(seq.body_override, ctx) : baseTpl.body,
      };

      // Resolve recipient + early-skip reasons
      let recipient: string | null = null;
      let earlySkip: string | null = null;
      if (seq.audience === "fi_team") {
        if (seq.channel === "email") recipient = FI_TEAM_EMAIL;
        else earlySkip = "fi_team only supports email";
      } else if (attendee) {
        if (seq.channel === "email") {
          if (!attendee.email) earlySkip = "no email";
          else recipient = attendee.email;
        } else if (seq.channel === "sms") {
          if (!attendee.phone) earlySkip = "no phone";
          else if (!attendee.sms_opt_in) earlySkip = "no sms opt-in";
          else recipient = attendee.phone;
        }
      } else {
        earlySkip = "no attendee linked";
      }

      // Always queue a row so it shows up in review UI
      if (earlySkip) {
        await supabase.from("outreach_sequence_runs").insert({
          external_record_id: rec.id,
          sequence_id: seq.id,
          status: "skipped",
          detail: earlySkip,
          subject: tpl.subject,
          body: tpl.body,
          recipient,
          channel: seq.channel,
        });
        skipped++;
        continue;
      }

      if (seq.requires_approval) {
        await supabase.from("outreach_sequence_runs").insert({
          external_record_id: rec.id,
          sequence_id: seq.id,
          status: "pending_approval",
          detail: null,
          subject: tpl.subject,
          body: tpl.body,
          recipient,
          channel: seq.channel,
        });
        queued++;
        continue;
      }

      // Send immediately (only if step explicitly opts out of approval)
      let status: "sent" | "failed" = "sent";
      let detail: string | null = null;
      try {
        if (seq.channel === "email") {
          await supabase.functions.invoke("send-email", {
            body: { to: recipient, subject: tpl.subject, html: tpl.body.replace(/\n/g, "<br/>"), related_attendee_id: attendee?.id },
          });
        } else if (seq.channel === "sms") {
          await supabase.functions.invoke("send-sms", {
            body: { to: recipient, body: tpl.body, related_attendee_id: attendee?.id },
          });
        }
      } catch (err) {
        status = "failed";
        detail = err instanceof Error ? err.message : String(err);
      }

      await supabase.from("outreach_sequence_runs").insert({
        external_record_id: rec.id,
        sequence_id: seq.id,
        status,
        detail,
        subject: tpl.subject,
        body: tpl.body,
        recipient,
        channel: seq.channel,
      });

      if (status === "sent" && seq.audience === "requester" && attendee?.id) {
        // Reflect the send on the FI follow-up queue
        try {
          await supabase
            .from("follow_ups")
            .update({ status: "contacted" })
            .eq("attendee_id", attendee.id)
            .eq("type", "outreach")
            .eq("status", "pending");
        } catch (e) { console.error("follow_up status update failed", e); }

        if (rec.source === "interest") {
          try { await supabase.rpc("advance_interest_pipeline", { _attendee_id: attendee.id }); } catch (e) { console.error(e); }
        }
      }
      dispatched++;
    }
  }

  return new Response(JSON.stringify({ ok: true, queued, dispatched, skipped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

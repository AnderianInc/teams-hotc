// Runs hourly via pg_cron. For each due outreach_sequences step + external_record,
// it renders the message. Approval-required steps are queued ahead of time
// (regardless of due date) so they can be reviewed before they're due.
// Approved-but-future rows are sent when the dispatcher next runs after dueAt.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";
import { normalizePhone } from "../_shared/phone.ts";
import { isDoNotContact, findRecentDuplicate } from "../_shared/duplicateGuard.ts";

const DEFAULT_TZ = "America/Los_Angeles";
const SEND_HOUR = 9; // 9 AM church-local for date-anchored sends

// Compute the absolute scheduled-send moment for a step.
//  - "event_date" anchor: YYYY-MM-DD interpreted as 9 AM church-local on that day + offset_days
//  - "received" anchor: full timestamp + offset_days (24h math, unchanged)
function computeScheduledFor(
  anchorKind: "received" | "event_date",
  anchorValue: string,
  offsetDays: number,
  tz: string,
): string {
  if (anchorKind === "event_date") {
    const [y, m, d] = anchorValue.split("-").map(Number);
    if (!y || !m || !d) return new Date(anchorValue).toISOString();
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() + offsetDays);
    const yy = base.getUTCFullYear();
    const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(base.getUTCDate()).padStart(2, "0");
    const hh = String(SEND_HOUR).padStart(2, "0");
    // "YYYY-MM-DD HH:00:00" interpreted in church tz → real UTC instant
    return fromZonedTime(`${yy}-${mm}-${dd} ${hh}:00:00`, tz).toISOString();
  }
  return new Date(new Date(anchorValue).getTime() + offsetDays * 86400000).toISOString();
}

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

async function sendRun(_supabase: any, run: any, attendeeId: string | null, loggedBy: string | null) {
  let status: "sent" | "failed" = "sent";
  let detail: string | null = null;
  try {
    const fnName = run.channel === "email" ? "send-email"
      : run.channel === "sms" ? "send-sms"
      : null;
    if (!fnName) return { status: "failed" as const, detail: `unsupported channel: ${run.channel}` };

    const body = run.channel === "email"
      ? {
          to: run.recipient,
          subject: run.subject,
          html: (run.body || "").replace(/\n/g, "<br/>"),
          related_attendee_id: attendeeId,
          logged_by: loggedBy,
        }
      : {
          to: run.recipient,
          body: run.body,
          related_attendee_id: attendeeId,
          logged_by: loggedBy,
        };

    // Direct fetch is more reliable than supabase.functions.invoke from inside an edge function
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resp.ok) {
      status = "failed";
      const text = await resp.text().catch(() => "");
      detail = `HTTP ${resp.status}: ${text}`.slice(0, 500);
    } else {
      const json = await resp.json().catch(() => ({}));
      if (json?.error) {
        status = "failed";
        detail = String(json.error).slice(0, 500);
      }
    }
  } catch (err) {
    status = "failed";
    detail = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  }
  return { status, detail };
}

async function insertRun(supabase: any, values: Record<string, unknown>) {
  const { error } = await supabase.from("outreach_sequence_runs").insert(values);
  if (error) throw new Error(`Could not save outreach run: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Load church timezone for date-anchored scheduling
  const { data: tzRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "church_timezone")
    .maybeSingle();
  const churchTz = ((tzRow?.value as any)?.tz as string) || DEFAULT_TZ;

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
  let expired = 0;

  const computeGraceDays = (anchor: string, offsetDays: number) =>
    anchor === "event_date" ? (offsetDays < 0 ? 0 : 1) : 1;

  // === Pass 0: expire stale pending_approval runs ===
  const { data: pendingRuns = [] } = await supabase
    .from("outreach_sequence_runs")
    .select("id, scheduled_for, outreach_sequences!inner(anchor, offset_days)")
    .eq("status", "pending_approval");

  for (const r of (pendingRuns as any[]) || []) {
    if (!r.scheduled_for) continue;
    const seq = r.outreach_sequences;
    if (!seq) continue;
    const grace = computeGraceDays(seq.anchor, seq.offset_days);
    const staleCutoff = new Date(r.scheduled_for).getTime() + grace * 86400000;
    if (Date.now() > staleCutoff) {
      await supabase.from("outreach_sequence_runs").update({
        status: "skipped",
        detail: "stale: scheduled date passed before approval",
      }).eq("id", r.id);
      expired++;
    }
  }

  // === Pass 1: queue new rows / send non-approval steps that are due ===
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
      const scheduled_for = computeScheduledFor(seq.anchor, anchorDate, seq.offset_days, churchTz);
      const dueAt = new Date(scheduled_for).getTime();

      // Stale guard: if scheduled date has already passed beyond grace window,
      // record as skipped so late-added records don't trigger obsolete reminders.
      const graceDays = seq.anchor === "event_date"
        ? (seq.offset_days < 0 ? 0 : 1)
        : 1;
      const staleCutoff = dueAt + graceDays * 86400000;
      if (Date.now() > staleCutoff) {
        await insertRun(supabase, {
          external_record_id: rec.id,
          sequence_id: seq.id,
          status: "skipped",
          detail: "stale: scheduled date already passed",
          subject: null,
          body: null,
          recipient: null,
          channel: seq.channel,
          scheduled_for,
        });
        skipped++;
        continue;
      }

      // Non-approval steps only act once due
      if (!seq.requires_approval && Date.now() < dueAt) continue;



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

      let recipient: string | null = null;
      let earlySkip: string | null = null;
      if (seq.audience === "fi_team") {
        if (seq.channel === "email") recipient = FI_TEAM_EMAIL;
        else earlySkip = "fi_team only supports email";
      } else if (attendee) {
        const dnc = await isDoNotContact(supabase, attendee.id, attendee.email, attendee.phone);
        if (dnc) {
          earlySkip = "do_not_contact";
        } else if (seq.channel === "email") {
          if (!attendee.email) earlySkip = "no email";
          else recipient = attendee.email;
        } else if (seq.channel === "sms") {
          if (!attendee.phone) {
            earlySkip = "no phone";
          } else {
            const p = normalizePhone(attendee.phone);
            if (!p.valid || !p.e164) earlySkip = "invalid phone";
            else if (!attendee.sms_opt_in) earlySkip = "no sms opt-in";
            else recipient = p.e164;
          }
        }
      } else {
        earlySkip = "no attendee linked";
      }

      // Duplicate guard
      if (!earlySkip && recipient) {
        const dup = await findRecentDuplicate({
          supabase,
          channel: seq.channel === "sms" ? "sms" : "email",
          toEmail: seq.channel === "email" ? recipient : null,
          toPhone: seq.channel === "sms" ? recipient : null,
          subject: tpl.subject,
          bodyPrefix: tpl.body,
          sequenceId: seq.id,
          externalRecordId: rec.id,
          withinDays: 14,
        });
        if (dup) earlySkip = `duplicate (sent ${new Date(dup.sentAt).toISOString().slice(0,10)})`;
      }

      // scheduled_for computed above

      if (earlySkip) {
        await insertRun(supabase, {
          external_record_id: rec.id,
          sequence_id: seq.id,
          status: "skipped",
          detail: earlySkip,
          subject: tpl.subject,
          body: tpl.body,
          recipient,
          channel: seq.channel,
          scheduled_for,
        });
        skipped++;
        continue;
      }

      if (seq.requires_approval) {
        await insertRun(supabase, {
          external_record_id: rec.id,
          sequence_id: seq.id,
          status: "pending_approval",
          detail: null,
          subject: tpl.subject,
          body: tpl.body,
          recipient,
          channel: seq.channel,
          scheduled_for,
        });
        queued++;
        continue;
      }

      // auto-send (no approval needed, due)
      const { status, detail } = await sendRun(
        supabase,
        { channel: seq.channel, recipient, subject: tpl.subject, body: tpl.body },
        attendee?.id || null,
        null,
      );
      await insertRun(supabase, {
        external_record_id: rec.id,
        sequence_id: seq.id,
        status,
        detail,
        subject: tpl.subject,
        body: tpl.body,
        recipient,
        channel: seq.channel,
        scheduled_for,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      });

      if (status === "sent" && seq.audience === "requester" && attendee?.id) {
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

  // === Pass 2: send previously approved rows whose scheduled_for has arrived ===
  // Filter out anything that's already been sent — protects against re-approval bugs
  // that would otherwise resend a message that already shipped.
  const { data: approvedDue = [] } = await supabase
    .from("outreach_sequence_runs")
    .select("*, external_records!inner(source, attendee_id)")
    .eq("status", "approved")
    .is("sent_at", null)
    .lte("scheduled_for", new Date().toISOString());

  for (const r of approvedDue as any[]) {
    const attendeeId = r.external_records?.attendee_id || null;
    const { status, detail } = await sendRun(supabase, r, attendeeId, r.approved_by || null);
    await supabase.from("outreach_sequence_runs").update({
      status,
      detail,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    }).eq("id", r.id);
    if (status === "sent" && attendeeId) {
      try {
        await supabase
          .from("follow_ups")
          .update({ status: "contacted" })
          .eq("attendee_id", attendeeId)
          .eq("type", "outreach")
          .eq("status", "pending");
      } catch (e) { console.error("follow_up status update failed", e); }
      if (r.external_records?.source === "interest") {
        try { await supabase.rpc("advance_interest_pipeline", { _attendee_id: attendeeId }); } catch (e) { console.error(e); }
      }
    }
    if (status === "sent") dispatched++;
  }

  return new Response(JSON.stringify({ ok: true, queued, dispatched, skipped, expired }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

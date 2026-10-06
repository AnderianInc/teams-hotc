// Polls the external read-only outreach API and upserts records into external_records.
// Triggered by pg_cron hourly and on-demand by admins via the UI.
import { createClient } from "npm:@supabase/supabase-js@2";
import { queueEventWorkflow } from "../_shared/eventWorkflow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://avnjcymyohgpvdewrpee.supabase.co/functions/v1/outreach-api";
const SOURCES: Array<{ key: "prayer" | "visit" | "interest"; path: string }> = [
  { key: "prayer", path: "/prayer-requests" },
  { key: "visit", path: "/visit-requests" },
  { key: "interest", path: "/interest-meetings" },
];

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : digits || null;
}

async function fetchPage(path: string, apiKey: string, since: string | null, offset: number) {
  const url = new URL(BASE_URL + path);
  url.searchParams.set("limit", "500");
  url.searchParams.set("offset", String(offset));
  if (since) url.searchParams.set("since", since);
  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ data: any[]; count: number; limit: number; offset: number }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const apiKey = Deno.env.get("OUTREACH_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OUTREACH_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary: Record<string, { imported: number; error?: string }> = {};
  let phoneCache: any[] | null = null;
  const deadline = Date.now() + 120000; // stop before the 150s edge limit

  for (const src of SOURCES) {
    try {
      const { data: state } = await supabase
        .from("external_sync_state")
        .select("last_synced_at")
        .eq("source", src.key)
        .maybeSingle();
      const since = state?.last_synced_at ?? null;

      let offset = 0;
      let imported = 0;
      const runStartedAt = new Date().toISOString();

      while (true) {
        const page = await fetchPage(src.path, apiKey, since, offset);
        if (!page.data?.length) break;

        // Pre-fetch existing attendees for dedup
        const emails = page.data.map((r: any) => (r.email || "").toLowerCase()).filter(Boolean);
        const phones = page.data.map((r: any) => normalizePhone(r.phone)).filter(Boolean) as string[];

        const { data: matchByEmail } = emails.length
          ? await supabase.from("attendees").select("id, email, phone, last_name").in("email", emails)
          : { data: [] as any[] };

        if (phones.length && !phoneCache) {
          const { data } = await supabase.from("attendees").select("id, email, phone, last_name").not("phone", "is", null);
          phoneCache = data || [];
        }
        const allAttendees = phoneCache || [];

        const byEmail = new Map<string, any>();
        (matchByEmail || []).forEach((a: any) => a.email && byEmail.set(a.email.toLowerCase(), a));
        const byPhone = new Map<string, any>();
        (allAttendees || []).forEach((a: any) => {
          const n = normalizePhone(a.phone);
          if (n) byPhone.set(n, a);
        });

        for (const r of page.data) {
          const externalId = String(r.id);
          const eventDate = r.event_date || r.scheduled_for || r.meeting_date || r.preferred_date || null;

          const { data: existingRecord, error: existingRecordErr } = await supabase
            .from("external_records")
            .select("id, status")
            .eq("source", src.key)
            .eq("external_id", externalId)
            .maybeSingle();

          if (existingRecordErr) {
            console.error("lookup external record failed", existingRecordErr);
            continue;
          }

          if (existingRecord?.status === "ignored") {
            await supabase
              .from("external_records")
              .update({
                payload: r,
                event_date: eventDate,
                processed_at: new Date().toISOString(),
              })
              .eq("id", existingRecord.id);
            imported++;
            continue;
          }

          const email = (r.email || "").toLowerCase() || null;
          const phoneNorm = normalizePhone(r.phone);
          let attendeeId: string | null = null;
          let matchReason: string | null = null;
          let status: string = "pending_review";

          const exact =
            (email && byEmail.get(email)) ||
            (phoneNorm && byPhone.get(phoneNorm));
          if (exact) {
            attendeeId = exact.id;
            matchReason = email && byEmail.get(email) ? "email" : "phone";
            status = "merged";
          } else {
            // No match → keep them OUT of the Church Directory. Create a funnel
            // lead instead; they're promoted to attendees only when they visit.
            const [first, ...rest] = (r.name || "").split(" ");
            const last = rest.join(" ") || "";
            const sourceTag = src.key === "prayer" ? "prayer-request" : src.key === "visit" ? "visit-request" : "interest-meeting";
            const leadType = src.key === "interest" ? "interest" : src.key === "prayer" ? "prayer" : "visit";
            const smsConsent = r.sms_consent === true;
            const { data: newLead, error: leadErr } = await supabase
              .from("funnel_leads")
              .insert({
                first_name: first || "(unknown)",
                last_name: last,
                email: r.email || null,
                phone: r.phone || null,
                lead_type: leadType,
                visit_date: eventDate || new Date().toISOString().slice(0, 10),
                message: r.notes || r.message || null,
                sms_opt_in: smsConsent,
                sms_opt_in_at: smsConsent ? (r.sms_consent_at || new Date().toISOString()) : null,
                sms_opt_in_text: smsConsent
                  ? `Opted in via ${sourceTag} (${r.sms_consent_source || "website form"}).`
                  : null,
                utm_source: sourceTag,
                status: "planned",
              })
              .select("id")
              .single();
            if (leadErr) {
              console.error("create funnel lead failed", leadErr);
              continue;
            }

            // Follow-ups come only from the event an admin mapped this source to
            // (Events settings). Unmapped sources get no automated messages.
            try {
              const { data: map } = await supabase.from("external_source_mappings")
                .select("event_id").eq("source_key", src.key).maybeSingle();
              if (map?.event_id) {
                const { data: ev } = await supabase.from("events").select("*").eq("id", map.event_id).maybeSingle();
                if (ev) {
                  await supabase.from("funnel_leads").update({
                    event_id: ev.id,
                    tags: [`event:${ev.slug}`, `registrant:${leadType}`, `registered:${new Date().toISOString().slice(0, 7)}`, `source:${sourceTag}`],
                  }).eq("id", newLead.id);
                  const { data: fullLead } = await supabase.from("funnel_leads").select("*").eq("id", newLead.id).single();
                  await queueEventWorkflow(supabase, ev, fullLead);
                }
              } else {
                await supabase.from("funnel_leads").update({
                  tags: [`registrant:${leadType}`, `registered:${new Date().toISOString().slice(0, 7)}`, `source:${sourceTag}`],
                }).eq("id", newLead.id);
              }
            } catch (msgQueueErr) {
              console.error("queue event workflow failed", msgQueueErr);
            }

            matchReason = "funnel_lead";
            status = "created";
          }

          // Append source tag if matched existing attendee
          if (status === "merged" && attendeeId) {
            const sourceTag = `source:${src.key === "prayer" ? "prayer-request" : src.key === "visit" ? "visit-request" : "interest-meeting"}`;
            const { data: a } = await supabase
              .from("attendees")
              .select("tags")
              .eq("id", attendeeId)
              .maybeSingle();
            const tags: string[] = (a?.tags || []) as string[];
            if (!tags.includes(sourceTag)) {
              await supabase.from("attendees").update({ tags: [...tags, sourceTag] }).eq("id", attendeeId);
            }
          }

          await supabase.from("external_records").upsert(
            {
              source: src.key,
              external_id: externalId,
              payload: r,
              status,
              attendee_id: attendeeId,
              match_reason: matchReason,
              event_date: eventDate,
              processed_at: new Date().toISOString(),
            },
            { onConflict: "source,external_id" },
          );
          imported++;
        }

        if (page.data.length < (page.limit || 500)) break;
        offset += page.data.length;
        if (Date.now() > deadline) throw new Error("Time budget reached; will resume next run");
      }

      await supabase.from("external_sync_state").upsert({
        source: src.key,
        last_synced_at: runStartedAt,
        last_run_status: "ok",
        last_error: null,
        records_imported: imported,
        updated_at: new Date().toISOString(),
      });
      summary[src.key] = { imported };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`sync ${src.key} failed`, msg);
      await supabase.from("external_sync_state").upsert({
        source: src.key,
        last_run_status: "error",
        last_error: msg,
        updated_at: new Date().toISOString(),
      });
      summary[src.key] = { imported: 0, error: msg };
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

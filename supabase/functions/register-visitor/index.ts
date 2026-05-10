import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Render a template that supports:
 *  - {{var}} simple substitution
 *  - {{#var}} ... {{/var}} conditional block — block is kept if var is non-empty/truthy, otherwise stripped
 */
function renderTemplate(template: string, values: Record<string, unknown>): string {
  // Process conditional blocks first (greedy across newlines)
  let out = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key, inner) => {
    const v = values[key];
    const truthy = v !== undefined && v !== null && String(v).trim() !== "";
    return truthy ? inner : "";
  });
  // Then simple substitutions
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = values[key];
    return v === undefined || v === null ? "" : String(v);
  });
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { firstName, lastName, email, phone, address, howHeard, prayerRequests, smsOptIn } = await req.json();

    if (!firstName || !lastName) throw new Error("First name and last name are required");

    const optInTimestamp = smsOptIn && phone?.trim() ? new Date().toISOString() : null;

    const { data: attendee, error: attendeeError } = await adminClient
      .from("attendees")
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        how_heard: howHeard?.trim() || null,
        prayer_requests: prayerRequests?.trim() || null,
        is_member: false,
        first_visit_date: new Date().toISOString().split("T")[0],
        tags: ["first-timer"],
        sms_opt_in: !!optInTimestamp,
        sms_opt_in_at: optInTimestamp,
        sms_opt_in_source: optInTimestamp ? "welcome_form" : null,
        sms_opt_in_text: optInTimestamp
          ? "Yes, I agree to receive recurring text messages from House of Transformation Church about services, events, prayer follow-up and announcements. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to unsubscribe."
          : null,
      })
      .select("id")
      .single();
    if (attendeeError) throw attendeeError;

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    // 1. General first-timer follow-up (skip if a pending outreach already exists for this attendee)
    const { data: existingFu } = await adminClient
      .from("follow_ups")
      .select("id")
      .eq("attendee_id", attendee.id)
      .eq("status", "pending")
      .eq("type", "outreach")
      .limit(1)
      .maybeSingle();

    if (!existingFu) {
      await adminClient.from("follow_ups").insert({
        attendee_id: attendee.id,
        type: "outreach",
        priority: "normal",
        status: "pending",
        method: "in_person",
        due_date: tomorrow,
        prospect_pipeline_stage: "visited",
        notes: `First-time visitor registered via welcome form.${howHeard ? ` How they heard: ${howHeard}.` : ""}${prayerRequests ? ` Prayer request submitted.` : ""}`,
      });
    } else {
      // Make sure the existing follow-up is on the pipeline as well
      await adminClient.from("follow_ups")
        .update({ prospect_pipeline_stage: "visited" })
        .eq("id", (existingFu as any).id)
        .is("prospect_pipeline_stage", null);
    }

    // 2. Send a welcome SMS immediately if phone is provided, opt-in given, and Twilio is configured
    if (phone?.trim() && optInTimestamp) {
      const twilioApiKey = Deno.env.get("TWILIO_API_KEY");
      const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

      if (twilioApiKey && twilioFrom && lovableApiKey) {
        try {
          // Normalize to E.164
          let toPhone = phone.trim();
          if (!toPhone.startsWith("+")) {
            const digits = toPhone.replace(/\D/g, "");
            toPhone = digits.length === 10 ? `+1${digits}` : `+${digits}`;
          }

          const smsBody =
            `Hi ${firstName.trim()}, welcome to House of Transformation Church! ` +
            `We're so glad you joined us today. Someone from our team will be in touch soon. ` +
            `Reply STOP to unsubscribe, HELP for help. Msg & data rates may apply.`;

          const smsRes = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${lovableApiKey}`,
              "X-Connection-Api-Key": twilioApiKey,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: toPhone, From: twilioFrom, Body: smsBody }),
          });
          const smsData = await smsRes.json();

          await adminClient.from("sms_log").insert({
            to_phone: toPhone,
            to_name: fullName,
            body: smsBody,
            related_attendee_id: attendee.id,
            status: smsRes.ok ? "sent" : "failed",
            provider_message_id: smsData.sid || null,
            error: smsRes.ok ? null : (smsData.message || JSON.stringify(smsData)),
          });

          // Mark the outreach follow-up as contacted since welcome SMS was already sent
          if (smsRes.ok) {
            await adminClient.from("follow_ups")
              .update({ status: "contacted", method: "text" })
              .eq("attendee_id", attendee.id)
              .eq("type", "outreach")
              .eq("status", "pending");
          }
        } catch (smsErr) {
          console.error("Welcome SMS failed:", smsErr);
        }
      } else {
        // Twilio not configured — update the existing outreach follow-up to suggest a text instead of creating a duplicate
        await adminClient.from("follow_ups")
          .update({
            method: "text",
            notes: `Send a welcome text to ${fullName} at ${phone.trim()}.`,
          })
          .eq("attendee_id", attendee.id)
          .eq("type", "outreach")
          .eq("status", "pending");
      }
    }

    // 3. Notify all admins + first impressions members
    try {
      const { data: admins } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const { data: fiMembers } = await adminClient
        .from("team_members")
        .select("user_id, teams!inner(slug)")
        .eq("teams.slug", "first-impressions");

      const recipientIds = new Set<string>([
        ...(admins ?? []).map((r: any) => r.user_id),
        ...(fiMembers ?? []).map((r: any) => r.user_id),
      ]);

      if (recipientIds.size > 0) {
        const notifRows = Array.from(recipientIds).map((uid) => ({
          recipient_id: uid,
          type: "first_timer",
          title: "New first-time visitor",
          body: `${fullName} just registered${howHeard ? ` (${howHeard})` : ""}.`,
          url: "/admin?tab=first-impressions",
          data: { attendee_id: attendee.id },
        }));
        await adminClient.from("notifications").insert(notifRows);

        // Email admins (look up their emails from profiles)
        if (resendApiKey) {
          const { data: profs } = await adminClient
            .from("profiles")
            .select("user_id, email, full_name")
            .in("user_id", Array.from(recipientIds));
          const adminEmails = (profs ?? []).map((p: any) => p.email).filter(Boolean);
          if (adminEmails.length > 0) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "HOTC <hotc@pneumanation.com>",
                to: adminEmails,
                subject: `New first-time visitor: ${fullName}`,
                html: `<div style="font-family:sans-serif;max-width:520px">
                  <h2>New first-time visitor 🎉</h2>
                  <p><strong>${fullName}</strong> just registered via the welcome form.</p>
                  <ul>
                    ${email ? `<li>Email: ${email}</li>` : ""}
                    ${phone ? `<li>Phone: ${phone}</li>` : ""}
                    ${howHeard ? `<li>How they heard: ${howHeard}</li>` : ""}
                    ${prayerRequests ? `<li>Prayer request submitted</li>` : ""}
                  </ul>
                  <p>A follow-up has been auto-scheduled${phone ? " (including a text follow-up)" : ""}. Please review in the First Impressions dashboard.</p>
                </div>`,
              }),
            }).catch((e) => console.error("admin email failed", e));
          }
        }

        // Push notifications via existing notify function (one call per recipient)
        await Promise.allSettled(
          Array.from(recipientIds).map((uid) =>
            fetch(`${supabaseUrl}/functions/v1/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
              body: JSON.stringify({
                recipient_id: uid,
                type: "first_timer",
                title: "New first-time visitor",
                body: `${fullName} just registered`,
                url: "/admin?tab=first-impressions",
              }),
            }),
          ),
        );
      }
    } catch (e) {
      console.error("admin alert failed", e);
    }

    // 4. Welcome email to visitor
    if (email && resendApiKey) {
      const { data: tpl } = await adminClient
        .from("email_templates")
        .select("subject, body_html")
        .eq("slug", "welcome-visitor")
        .single();

      const values: Record<string, unknown> = {
        firstName: firstName.trim(),
        prayerRequests: prayerRequests?.trim() || "",
      };

      const subject = tpl ? renderTemplate(tpl.subject, values) : "Welcome to House of Transformation Church!";
      const html = tpl ? renderTemplate(tpl.body_html, values) : `<p>Welcome, ${firstName}!</p>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "HOTC <hotc@pneumanation.com>",
          to: [email.trim()],
          subject,
          html,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, attendeeId: attendee.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

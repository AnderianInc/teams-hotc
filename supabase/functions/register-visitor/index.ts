import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.25.76";
import { findWelcomePerson, issueWelcomeToken, recordWelcome } from "../_shared/welcomeIdentity.ts";
import { normalizePhone } from "../_shared/phone.ts";

const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(50), lastName: z.string().trim().min(1).max(50),
  email: z.union([z.literal(''), z.string().trim().email().max(255)]).optional(),
  phone: z.string().trim().max(30).optional(), address: z.string().trim().max(200).optional(),
  howHeard: z.string().trim().max(100).optional(), prayerRequests: z.string().trim().max(1000).optional(),
  smsOptIn: z.boolean().optional(),
});

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) throw new Error('Registration temporarily unavailable.');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const parsed = registrationSchema.safeParse(await req.json());
    if (!parsed.success) throw new Error('Please check your name, email and phone.');
    const { firstName, lastName, email, phone, address, howHeard, prayerRequests, smsOptIn } = parsed.data;
    const normalized = normalizePhone(phone);
    if (phone && !normalized.valid) throw new Error('Please enter a valid phone number.');
    const existing = await findWelcomePerson(adminClient, phone, email);
    if (existing) {
      const result = await recordWelcome(adminClient, existing);
      return new Response(JSON.stringify({ success: true, returning: true, ...result, token: await issueWelcomeToken(adminClient, existing) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const optInTimestamp = smsOptIn && phone?.trim() ? new Date().toISOString() : null;

    const { data: attendee, error: attendeeError } = await adminClient
      .from("attendees")
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email?.trim() || null,
        phone: normalized.e164 || null,
        phone_raw: phone || null,
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

    const attendanceResult = await recordWelcome(adminClient, { attendeeId: attendee.id });
    const deviceToken = await issueWelcomeToken(adminClient, { attendeeId: attendee.id });
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
          const toPhone = normalized.e164;
          const { data: smsTemplate, error: templateError } = await adminClient.from('sms_templates').select('body').eq('slug', 'welcome-visitor-sms').single();
          if (templateError || !smsTemplate) throw new Error('Welcome SMS template is missing.');
          const smsBody = renderTemplate(smsTemplate.body, { firstName, fullName });

          const smsRes = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: toPhone, body: smsBody, to_name: fullName, related_attendee_id: attendee.id }),
          });
          const smsData = await smsRes.json();
          if (!smsRes.ok) {
            await adminClient.from('sms_log').insert({ to_phone: toPhone, to_name: fullName, body: smsBody,
              related_attendee_id: attendee.id, status: 'failed', error: smsData.error || 'Welcome SMS failed' });
          }

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
          url: "/team/first-impressions?tab=followups",
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
            const { data: adminTemplate, error: adminTemplateError } = await adminClient.from('email_templates').select('subject,body_html').eq('slug', 'welcome-visitor-admin').single();
            if (adminTemplateError || !adminTemplate) throw new Error('Admin welcome template missing.');
            const escapeHtml = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const adminSubject = renderTemplate(adminTemplate.subject, { fullName });
            const adminHtml = renderTemplate(adminTemplate.body_html, Object.fromEntries(Object.entries({ fullName, email, phone, address, howHeard, prayerRequests }).map(([key,value]) => [key,escapeHtml(value || '')])));
            let adminOk = false;
            let adminErr: string | null = null;
            try {
              const adminRes = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: "HOTC <contact@hotc.life>",
                  to: adminEmails,
                  subject: adminSubject,
                  html: adminHtml,
                }),
              });
              adminOk = adminRes.ok;
              if (!adminOk) adminErr = await adminRes.text().catch(() => "send failed");
            } catch (e: any) {
              console.error("admin email failed", e);
              adminErr = e?.message || "send failed";
            }
            await adminClient.from("email_log").insert(
              adminEmails.map((to: string) => ({
                to_email: to,
                subject: adminSubject,
                body_html: adminHtml,
                related_attendee_id: attendee.id,
                status: adminOk ? "sent" : "failed",
                error: adminErr,
              })),
            );
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
                url: "/team/first-impressions?tab=followups",
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

      if (!tpl) throw new Error('Welcome email template is missing. Registration was saved; please contact the welcome team.');
      const subject = renderTemplate(tpl.subject, values);
      const html = renderTemplate(tpl.body_html, values);

      let welcomeOk = false;
      let welcomeErr: string | null = null;
      try {
        const welcomeRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "HOTC <contact@hotc.life>",
            to: [email.trim()],
            subject,
            html,
          }),
        });
        welcomeOk = welcomeRes.ok;
        if (!welcomeOk) welcomeErr = await welcomeRes.text().catch(() => "send failed");
      } catch (e: any) {
        console.error("welcome email failed", e);
        welcomeErr = e?.message || "send failed";
      }
      await adminClient.from("email_log").insert({
        to_email: email.trim(),
        to_name: fullName,
        subject,
        body_html: html,
        related_attendee_id: attendee.id,
        status: welcomeOk ? "sent" : "failed",
        error: welcomeErr,
      });
    }

    return new Response(JSON.stringify({ success: true, attendeeId: attendee.id, ...attendanceResult, token: deviceToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

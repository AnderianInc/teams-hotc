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
    const { firstName, lastName, email, phone, address, howHeard, prayerRequests } = await req.json();

    if (!firstName || !lastName) throw new Error("First name and last name are required");

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
      })
      .select("id")
      .single();
    if (attendeeError) throw attendeeError;

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    // 1. General first-timer follow-up
    await adminClient.from("follow_ups").insert({
      attendee_id: attendee.id,
      type: "outreach",
      priority: "normal",
      status: "pending",
      method: "in_person",
      due_date: tomorrow,
      notes: `First-time visitor registered via welcome form.${howHeard ? ` How they heard: ${howHeard}.` : ""}${prayerRequests ? ` Prayer request submitted.` : ""}`,
    });

    // 2. Auto-scheduled SMS follow-up if phone provided
    if (phone?.trim()) {
      await adminClient.from("follow_ups").insert({
        attendee_id: attendee.id,
        type: "outreach",
        priority: "normal",
        status: "pending",
        method: "text",
        due_date: tomorrow,
        notes: `Auto-scheduled SMS follow-up. Send a friendly thank-you text to ${fullName} at ${phone.trim()}.`,
      });
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

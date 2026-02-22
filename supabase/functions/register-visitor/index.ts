import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function replacePlaceholders(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(values)) {
    result = result.split(`{{${key}}}`).join(val);
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { firstName, lastName, email, phone, address, howHeard, prayerRequests } = await req.json();

    if (!firstName || !lastName) {
      throw new Error("First name and last name are required");
    }

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

    await adminClient.from("follow_ups").insert({
      attendee_id: attendee.id,
      status: "pending",
      notes: `First-time visitor registered via welcome form. ${howHeard ? `How they heard: ${howHeard}` : ""}`,
    });

    if (email && resendApiKey) {
      // Load template from DB
      const { data: tpl } = await adminClient
        .from("email_templates")
        .select("subject, body_html")
        .eq("slug", "welcome-visitor")
        .single();

      const values: Record<string, string> = {
        firstName: firstName.trim(),
        prayerRequests: prayerRequests?.trim() || "",
      };

      const subject = tpl ? replacePlaceholders(tpl.subject, values) : "Welcome to House of Transformation Church!";
      const html = tpl ? replacePlaceholders(tpl.body_html, values) : `<p>Welcome, ${firstName}!</p>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
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

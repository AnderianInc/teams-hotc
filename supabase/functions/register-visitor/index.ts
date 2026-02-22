import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Insert attendee
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

    // Create follow-up record
    await adminClient.from("follow_ups").insert({
      attendee_id: attendee.id,
      status: "pending",
      notes: `First-time visitor registered via welcome form. ${howHeard ? `How they heard: ${howHeard}` : ""}`,
    });

    // Send welcome email if email provided
    if (email && resendApiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HOTC <hotc@pneumanation.com>",
          to: [email.trim()],
          subject: "Welcome to House of Transformation Church!",
          html: `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8f8fc; border-radius: 12px;">
              <h2 style="color: #2d2b6b; margin-bottom: 8px;">Welcome, ${firstName}!</h2>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                We're so glad you visited <strong>House of Transformation Church</strong>! We hope you felt at home with us today.
              </p>
              <h3 style="color: #2d2b6b; margin-top: 24px;">What's Next?</h3>
              <ul style="color: #333; font-size: 15px; line-height: 1.8; padding-left: 20px;">
                <li>🙏 <strong>Join us again</strong> — Sunday services at 10:00 AM</li>
                <li>☕ <strong>Newcomers' Connect</strong> — Stay after service to meet the team</li>
                <li>📱 <strong>Stay connected</strong> — Follow us on social media for updates</li>
              </ul>
              ${prayerRequests ? `
              <p style="color: #333; font-size: 15px; line-height: 1.6; margin-top: 16px;">
                We've received your prayer request and our prayer team will be lifting you up in prayer. 💛
              </p>
              ` : ""}
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin-top: 24px;">
                If you have any questions, don't hesitate to reach out. We'd love to help you get connected!
              </p>
              <p style="color: #888; font-size: 13px; margin-top: 24px;">— The HOTC Family</p>
            </div>
          `,
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

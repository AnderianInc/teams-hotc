import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get today's month and day
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Query attendees whose birthday is today and have an email
    const { data: birthdayPeople, error } = await adminClient
      .from("attendees")
      .select("id, first_name, last_name, email, date_of_birth")
      .not("date_of_birth", "is", null)
      .not("email", "is", null);

    if (error) throw error;

    // Filter for today's birthdays (month/day match)
    const todaysBirthdays = (birthdayPeople || []).filter((p) => {
      if (!p.date_of_birth) return false;
      const dob = new Date(p.date_of_birth + "T00:00:00");
      return dob.getMonth() + 1 === month && dob.getDate() === day;
    });

    let sent = 0;

    for (const person of todaysBirthdays) {
      if (!person.email) continue;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HOTC <hotc@pneumanation.com>",
          to: [person.email],
          subject: `🎂 Happy Birthday, ${person.first_name}!`,
          html: `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8f8fc; border-radius: 12px;">
              <h2 style="color: #2d2b6b; margin-bottom: 8px;">🎂 Happy Birthday, ${person.first_name}!</h2>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                From all of us at <strong>House of Transformation Church</strong>, we want to wish you the happiest of birthdays!
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                May God bless you abundantly in this new year of life. We are so grateful to have you as part of our church family. 🙏
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                Enjoy your special day!
              </p>
              <p style="color: #888; font-size: 13px; margin-top: 24px;">— With love, The HOTC Family</p>
            </div>
          `,
        }),
      });
      sent++;
    }

    return new Response(
      JSON.stringify({ success: true, birthdaysFound: todaysBirthdays.length, emailsSent: sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

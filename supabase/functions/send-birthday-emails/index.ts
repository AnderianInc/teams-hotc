import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const { data: birthdayPeople, error } = await adminClient
      .from("attendees")
      .select("id, first_name, last_name, email, date_of_birth")
      .not("date_of_birth", "is", null)
      .not("email", "is", null);

    if (error) throw error;

    const todaysBirthdays = (birthdayPeople || []).filter((p) => {
      if (!p.date_of_birth) return false;
      const dob = new Date(p.date_of_birth + "T00:00:00");
      return dob.getMonth() + 1 === month && dob.getDate() === day;
    });

    // Load template from DB
    const { data: tpl } = await adminClient
      .from("email_templates")
      .select("subject, body_html")
      .eq("slug", "birthday")
      .single();

    let sent = 0;

    for (const person of todaysBirthdays) {
      if (!person.email) continue;

      const values: Record<string, string> = {
        firstName: person.first_name,
        birthdayEmoji: "🎂",
      };

      const subject = tpl ? replacePlaceholders(tpl.subject, values) : `🎂 Happy Birthday, ${person.first_name}!`;
      const html = tpl ? replacePlaceholders(tpl.body_html, values) : `<p>Happy Birthday, ${person.first_name}!</p>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HOTC <community@hotc.life>",
          to: [person.email],
          subject,
          html,
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

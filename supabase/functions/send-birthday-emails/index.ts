// Daily birthday emails. Routes through send-email so do-not-contact,
// unsubscribe handling, and email_log all apply. Birthdays are evaluated
// in the church timezone (America/Los_Angeles), not UTC.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHURCH_TZ = "America/Los_Angeles";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Today's month/day in the church timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: CHURCH_TZ,
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date());
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);

    const { data: birthdayPeople, error } = await supabase
      .from("attendees")
      .select("id, first_name, last_name, email, date_of_birth, do_not_contact")
      .not("date_of_birth", "is", null)
      .not("email", "is", null)
      .eq("do_not_contact", false);

    if (error) throw error;

    const todaysBirthdays = (birthdayPeople || []).filter((p) => {
      if (!p.date_of_birth) return false;
      const [, m, d] = p.date_of_birth.split("-").map(Number);
      return m === month && d === day;
    });

    const { data: tpl } = await supabase
      .from("email_templates")
      .select("subject, body_html")
      .eq("slug", "birthday")
      .single();

    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (const person of todaysBirthdays) {
      if (!person.email) continue;

      const values: Record<string, string> = {
        firstName: person.first_name,
        birthdayEmoji: "🎂",
      };

      const subject = tpl ? replacePlaceholders(tpl.subject, values) : `🎂 Happy Birthday, ${person.first_name}!`;
      const html = tpl ? replacePlaceholders(tpl.body_html, values) : `<p>Happy Birthday, ${person.first_name}!</p>`;

      try {
        const { data, error: sendErr } = await supabase.functions.invoke("send-email", {
          body: {
            to: person.email,
            to_name: `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim(),
            subject,
            html,
            related_attendee_id: person.id,
          },
        });
        if (sendErr || data?.error) throw new Error(sendErr?.message || data?.error);
        sent++;
      } catch (e) {
        failed++;
        errors.push(`${person.first_name}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, birthdaysFound: todaysBirthdays.length, emailsSent: sent, failed, errors: errors.slice(0, 10) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

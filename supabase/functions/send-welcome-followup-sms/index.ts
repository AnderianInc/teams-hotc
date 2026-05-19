// Day-after welcome SMS to people who registered via /welcome.
// Runs daily via pg_cron. Picks attendees created 22-26h ago, with sms_opt_in,
// not already tagged welcome_followup_sms_sent, not do_not_contact.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function render(body: string, vars: Record<string, string>): string {
  return body
    .replace(/\{\{\s*first_name\s*\}\}/gi, vars.first_name ?? "")
    .replace(/\{\{\s*last_name\s*\}\}/gi, vars.last_name ?? "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load template
    const { data: tpl } = await supabase
      .from("sms_templates")
      .select("body")
      .eq("slug", "welcome_followup_sms")
      .maybeSingle();
    if (!tpl?.body) {
      return new Response(JSON.stringify({ error: "Template welcome_followup_sms not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find candidates: registered 22-26h ago
    const now = Date.now();
    const since = new Date(now - 26 * 60 * 60 * 1000).toISOString();
    const until = new Date(now - 22 * 60 * 60 * 1000).toISOString();

    const { data: attendees, error } = await supabase
      .from("attendees")
      .select("id, first_name, last_name, phone, tags, sms_opt_in, do_not_contact, created_at")
      .gte("created_at", since)
      .lte("created_at", until)
      .eq("sms_opt_in", true)
      .eq("do_not_contact", false)
      .not("phone", "is", null);
    if (error) throw error;

    let sent = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const a of attendees ?? []) {
      const tags: string[] = a.tags ?? [];
      if (tags.includes("welcome_followup_sms_sent")) { skipped++; continue; }
      const msg = render(tpl.body, { first_name: a.first_name ?? "", last_name: a.last_name ?? "" });
      try {
        const { data, error: sendErr } = await supabase.functions.invoke("send-sms", {
          body: {
            to: a.phone,
            body: msg,
            to_name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
            related_attendee_id: a.id,
          },
        });
        if (sendErr || data?.error) throw new Error(sendErr?.message || data?.error);
        // tag attendee
        await supabase
          .from("attendees")
          .update({
            tags: Array.from(new Set([...(tags ?? []), "welcome_followup_sms_sent"])),
          })
          .eq("id", a.id);
        sent++;
      } catch (e) {
        failed++;
        errors.push(`${a.first_name}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ sent, skipped, failed, errors: errors.slice(0, 10), considered: attendees?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

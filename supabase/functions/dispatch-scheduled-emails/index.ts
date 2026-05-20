import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: due, error } = await sb
      .from("pending_email_approvals")
      .select("*")
      .eq("status", "approved")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);
    if (error) throw error;

    let sent = 0, failed = 0;
    for (const row of due ?? []) {
      try {
        const res = await sb.functions.invoke("send-email", {
          body: {
            to: row.to_email,
            to_name: row.to_name,
            subject: row.subject,
            html: row.body_html,
            logged_by: row.approved_by,
            related_attendee_id: row.attendee_id,
          },
        });
        if (res.error || (res.data as any)?.error) {
          throw new Error(res.error?.message || (res.data as any)?.error);
        }
        await sb.from("pending_email_approvals").update({
          status: "sent", sent_at: new Date().toISOString(), error: null,
        }).eq("id", row.id);
        sent++;
      } catch (e) {
        await sb.from("pending_email_approvals").update({
          status: "failed", error: (e as Error).message,
        }).eq("id", row.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed: due?.length ?? 0, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

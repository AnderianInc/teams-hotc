import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token");
    if (!token && req.method === "POST") {
      try {
        const body = await req.json();
        token = body?.token ?? null;
      } catch {/* ignore */}
    }
    if (!token) throw new Error("Missing token");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row, error } = await sb
      .from("email_unsubscribes")
      .select("id, email, unsubscribed_at")
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Invalid token");

    if (!row.unsubscribed_at) {
      await sb.from("email_unsubscribes").update({ unsubscribed_at: new Date().toISOString() }).eq("id", row.id);
      // Best-effort mirror into attendees/profiles
      await sb.from("attendees").update({ do_not_contact: true }).eq("email", row.email);
      await sb.from("profiles").update({ do_not_contact: true }).eq("email", row.email);
    }

    return new Response(JSON.stringify({ success: true, email: row.email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Backfills phone numbers to E.164 canonical form across attendees + profiles.
// Idempotent: stores original in phone_raw (only if empty), writes canonical to phone,
// and logs unparseable values to phone_normalization_issues.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhone } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const summary = { attendees_scanned: 0, attendees_updated: 0, profiles_scanned: 0, profiles_updated: 0, issues_logged: 0 };

    for (const table of ["attendees", "profiles"] as const) {
      const pageSize = 500;
      let from = 0;
      while (true) {
        const { data, error } = await supa
          .from(table)
          .select("id, phone, phone_raw")
          .not("phone", "is", null)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;

        if (table === "attendees") summary.attendees_scanned += data.length;
        else summary.profiles_scanned += data.length;

        for (const row of data) {
          const original = (row as any).phone as string | null;
          if (!original) continue;
          const res = normalizePhone(original);
          if (!res.valid || !res.e164) {
            await supa.from("phone_normalization_issues").insert({
              source_table: table,
              row_id: (row as any).id,
              original,
              reason: res.reason ?? "invalid",
            });
            summary.issues_logged++;
            continue;
          }
          if (res.e164 === original) continue;
          const patch: any = { phone: res.e164 };
          if (!(row as any).phone_raw) patch.phone_raw = original;
          const { error: uerr } = await supa.from(table).update(patch).eq("id", (row as any).id);
          if (!uerr) {
            if (table === "attendees") summary.attendees_updated++;
            else summary.profiles_updated++;
          }
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("normalize-phones error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

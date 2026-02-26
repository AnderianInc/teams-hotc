import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { type, user_id, attendee_id, first_name, last_name, phone } =
      await req.json();

    // Calculate current week's Sunday as service_date
    const now = new Date();
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    const serviceDate = sunday.toISOString().split("T")[0];

    if (type === "volunteer") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id is required for volunteers" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate user exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_id", user_id)
        .single();

      if (!profile) {
        return new Response(
          JSON.stringify({ error: "Volunteer not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for duplicate
      const { data: existing } = await supabase
        .from("weekly_attendance")
        .select("id")
        .eq("user_id", user_id)
        .eq("service_date", serviceDate)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ status: "already_checked_in", name: profile.full_name }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase.from("weekly_attendance").insert({
        user_id,
        service_date: serviceDate,
        status: "present",
        is_self_reported: true,
      });

      if (error) throw error;

      return new Response(
        JSON.stringify({ status: "checked_in", name: profile.full_name }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "member") {
      let finalAttendeeId = attendee_id;
      let memberName = "";

      if (!finalAttendeeId) {
        // New member registration
        if (!first_name || !last_name) {
          return new Response(
            JSON.stringify({ error: "first_name and last_name required for new members" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: newAttendee, error: insertErr } = await supabase
          .from("attendees")
          .insert({
            first_name,
            last_name,
            phone: phone || null,
            is_member: true,
          })
          .select("id, first_name, last_name")
          .single();

        if (insertErr) throw insertErr;
        finalAttendeeId = newAttendee.id;
        memberName = `${newAttendee.first_name} ${newAttendee.last_name}`;
      } else {
        // Validate attendee exists
        const { data: attendee } = await supabase
          .from("attendees")
          .select("id, first_name, last_name")
          .eq("id", finalAttendeeId)
          .single();

        if (!attendee) {
          return new Response(
            JSON.stringify({ error: "Member not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        memberName = `${attendee.first_name} ${attendee.last_name}`;
      }

      // Check for duplicate
      const { data: existing } = await supabase
        .from("weekly_attendance")
        .select("id")
        .eq("attendee_id", finalAttendeeId)
        .eq("service_date", serviceDate)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ status: "already_checked_in", name: memberName }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase.from("weekly_attendance").insert({
        attendee_id: finalAttendeeId,
        service_date: serviceDate,
        status: "present",
        is_self_reported: true,
      });

      if (error) throw error;

      return new Response(
        JSON.stringify({ status: "checked_in", name: memberName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid type. Must be 'volunteer' or 'member'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

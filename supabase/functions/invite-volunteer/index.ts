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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    // Verify the caller
    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { email, teamId, role } = await req.json();

    // Check if caller is admin OR team lead of the target team
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    const isAdmin = callerRoles && callerRoles.length > 0;

    if (!isAdmin) {
      const { data: membership } = await adminClient
        .from("team_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("team_id", teamId)
        .eq("role", "team_lead");

      if (!membership || membership.length === 0) {
        throw new Error("Only admins and team leads can invite volunteers");
      }

      if (role === "admin") {
        throw new Error("Team leads cannot assign admin role");
      }
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("email", email);

    let userId: string;

    if (existingUsers && existingUsers.length > 0) {
      userId = existingUsers[0].user_id;
    } else {
      // Create the user via admin API
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { invited_team_id: teamId, invited_role: role },
      });
      if (inviteError) throw inviteError;
      userId = inviteData.user.id;

      // Send custom invite email via Resend if configured
      if (resendApiKey) {
        // Get the team name for the email
        const { data: team } = await adminClient
          .from("teams")
          .select("name")
          .eq("id", teamId)
          .single();

        const teamName = team?.name || "the team";
        const siteUrl = supabaseUrl.replace(".supabase.co", "");

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "HOTC <hotc@pneumanation.com>",
            to: [email],
            subject: `You've been invited to join ${teamName}`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                <h2>You're invited!</h2>
                <p>You've been invited to join <strong>${teamName}</strong> at House on the Corner.</p>
                <p>Check your email for a confirmation link from our system to set up your account and get started.</p>
                <p style="color: #666; font-size: 14px; margin-top: 24px;">— The HOTC Team</p>
              </div>
            `,
          }),
        });
      }

      // Add user role
      await adminClient.from("user_roles").upsert({
        user_id: userId,
        role: role || "member",
      });
    }

    // Add to team
    const { error: teamError } = await adminClient.from("team_members").upsert(
      { team_id: teamId, user_id: userId, role: role || "member" },
      { onConflict: "team_id,user_id" }
    );
    if (teamError) throw teamError;

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

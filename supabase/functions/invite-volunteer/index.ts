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
      // Check if team lead of this specific team
      const { data: membership } = await adminClient
        .from("team_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("team_id", teamId)
        .eq("role", "team_lead");

      if (!membership || membership.length === 0) {
        throw new Error("Only admins and team leads can invite volunteers");
      }

      // Team leads can only invite as 'member', not 'team_lead' or 'admin'
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
      // User exists — just add to team
      userId = existingUsers[0].user_id;
    } else {
      // Invite new user via Supabase auth
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { invited_team_id: teamId, invited_role: role },
      });
      if (inviteError) throw inviteError;
      userId = inviteData.user.id;

      // Add user role
      await adminClient.from("user_roles").upsert({
        user_id: userId,
        role: role || "member",
      });
    }

    // Add to team (upsert to avoid duplicates)
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

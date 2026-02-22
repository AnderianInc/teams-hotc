import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Get team name for the email
    const { data: team } = await adminClient
      .from("teams")
      .select("name")
      .eq("id", teamId)
      .single();
    const teamName = team?.name || "the team";

    // Check if user already exists
    const { data: existingUsers } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("email", email);

    let userId: string;

    if (existingUsers && existingUsers.length > 0) {
      userId = existingUsers[0].user_id;

      // Generate a fresh magic link for resending
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (!linkError && linkData && resendApiKey) {
        const appUrl = Deno.env.get("SITE_URL") || `https://id-preview--ec8a92d7-c2a0-437b-b7a0-bd32f8d55569.lovable.app`;
        const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(appUrl + "/complete-profile")}`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "HOTC <hotc@pneumanation.com>",
            to: [email],
            subject: `You've been invited to join ${teamName} at House of Transformation Church`,
            html: `
              <div style="font-family: 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8f8fc; border-radius: 12px;">
                <h2 style="color: #2d2b6b; margin-bottom: 8px;">Welcome to House of Transformation Church!</h2>
                <p style="color: #333; font-size: 16px; line-height: 1.6;">
                  You've been invited to join <strong>${teamName}</strong> as a volunteer.
                </p>
                <p style="color: #333; font-size: 16px; line-height: 1.6;">
                  Click the button below to accept your invitation, set up your profile, and get started.
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${confirmUrl}" 
                     style="display: inline-block; background: #4338ca; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                    Accept Invitation
                  </a>
                </div>
                <p style="color: #888; font-size: 13px; margin-top: 24px;">
                  If you didn't expect this invitation, you can safely ignore this email.
                </p>
                <p style="color: #888; font-size: 13px;">— The HOTC Team</p>
              </div>
            `,
          }),
        });
      }
    } else {
      // Create the user silently (no system email)
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { invited_team_id: teamId, invited_role: role },
      });
      if (createError) throw createError;
      userId = newUser.user.id;

      // Create an attendee record and link to profile
      const { data: attendee } = await adminClient
        .from("attendees")
        .insert({
          first_name: email.split("@")[0],
          last_name: "",
          email,
          is_member: true,
        })
        .select("id")
        .single();

      if (attendee) {
        await adminClient
          .from("profiles")
          .update({ attendee_id: attendee.id })
          .eq("user_id", userId);
      }

      // Generate magic link for the single invite email
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (linkError) throw linkError;

      const appUrl = Deno.env.get("SITE_URL") || `https://id-preview--ec8a92d7-c2a0-437b-b7a0-bd32f8d55569.lovable.app`;
      const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(appUrl + "/complete-profile")}`;

      // Send ONE branded email via Resend
      if (resendApiKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "HOTC <hotc@pneumanation.com>",
            to: [email],
            subject: `You've been invited to join ${teamName} at House of Transformation Church`,
            html: `
              <div style="font-family: 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8f8fc; border-radius: 12px;">
                <h2 style="color: #2d2b6b; margin-bottom: 8px;">Welcome to House of Transformation Church!</h2>
                <p style="color: #333; font-size: 16px; line-height: 1.6;">
                  You've been invited to join <strong>${teamName}</strong> as a volunteer.
                </p>
                <p style="color: #333; font-size: 16px; line-height: 1.6;">
                  Click the button below to accept your invitation, set up your profile, and get started.
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${confirmUrl}" 
                     style="display: inline-block; background: #4338ca; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                    Accept Invitation
                  </a>
                </div>
                <p style="color: #888; font-size: 13px; margin-top: 24px;">
                  If you didn't expect this invitation, you can safely ignore this email.
                </p>
                <p style="color: #888; font-size: 13px;">— The HOTC Team</p>
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

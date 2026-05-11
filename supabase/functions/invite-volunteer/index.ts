import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { email, teamId, role } = await req.json();

    // Check if caller is admin OR team lead
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

    const { data: team } = await adminClient
      .from("teams")
      .select("name")
      .eq("id", teamId)
      .single();
    const teamName = team?.name || "the team";

    // Load template from DB
    const { data: tpl } = await adminClient
      .from("email_templates")
      .select("subject, body_html")
      .eq("slug", "volunteer-invite")
      .single();

    const { data: existingUsers } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("email", email);

    let userId: string;

    const sendInviteEmail = async (confirmUrl: string) => {
      if (!resendApiKey) return;

      const values: Record<string, string> = {
        teamName,
        confirmUrl,
      };

      const subject = tpl
        ? replacePlaceholders(tpl.subject, values)
        : `You've been invited to join ${teamName} at House of Transformation Church`;
      const html = tpl
        ? replacePlaceholders(tpl.body_html, values)
        : `<p>You've been invited to join <strong>${teamName}</strong>. <a href="${confirmUrl}">Accept Invitation</a></p>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HOTC <contact@hotc.life>",
          to: [email],
          subject,
          html,
        }),
      });
    };

    if (existingUsers && existingUsers.length > 0) {
      userId = existingUsers[0].user_id;

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (!linkError && linkData) {
        const appUrl = Deno.env.get("SITE_URL") || `https://teams.hotc.life`;
        const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(appUrl + "/complete-profile")}`;
        await sendInviteEmail(confirmUrl);
      }
    } else {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { invited_team_id: teamId, invited_role: role },
      });
      if (createError) throw createError;
      userId = newUser.user.id;

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

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (linkError) throw linkError;

      const appUrl = Deno.env.get("SITE_URL") || `https://teams.hotc.life`;
      const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(appUrl + "/complete-profile")}`;
      await sendInviteEmail(confirmUrl);

      await adminClient.from("user_roles").upsert({
        user_id: userId,
        role: role || "member",
      });
    }

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

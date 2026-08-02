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
    const { email, teamId, role, attendeeId, firstName, lastName } = await req.json();
    if (!email || typeof email !== "string") throw new Error("Email is required");
    if (!teamId || typeof teamId !== "string") throw new Error("Team is required");

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
          from: "HOTC <community@hotc.life>",
          to: [email],
          subject,
          html,
        }),
      });
    };

    // A profile row may be missing even when the auth user exists — resolve
    // the auth user directly so we never try to re-create an existing account.
    let existingUserId: string | null = existingUsers?.[0]?.user_id ?? null;
    if (!existingUserId) {
      const { data: authList } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = authList?.users?.find(
        (u: any) => (u.email || "").toLowerCase() === String(email).toLowerCase()
      );
      existingUserId = match?.id ?? null;
    }

    if (existingUserId) {
      userId = existingUserId;

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

      // Directory linking happens after this branch — never insert blindly here.



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

    // ---- Ensure a profile row exists (team_members.user_id references profiles.user_id) ----
    let { data: profileRow } = await adminClient
      .from("profiles")
      .select("id, attendee_id, full_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profileRow) {
      const guessName = `${(firstName || "").trim()} ${(lastName || "").trim()}`.trim();
      const { data: createdProfile, error: profileErr } = await adminClient
        .from("profiles")
        .insert({ user_id: userId, email, full_name: guessName })
        .select("id, attendee_id, full_name")
        .single();
      if (profileErr) throw profileErr;
      profileRow = createdProfile;
    }


    let linkedAttendeeId: string | null = profileRow?.attendee_id ?? null;

    if (!linkedAttendeeId && attendeeId) {
      const { data: byId } = await adminClient
        .from("attendees")
        .select("id")
        .eq("id", attendeeId)
        .maybeSingle();
      linkedAttendeeId = byId?.id ?? null;
    }

    if (!linkedAttendeeId) {
      const { data: byEmail } = await adminClient
        .from("attendees")
        .select("id")
        .ilike("email", email)
        .order("created_at", { ascending: true })
        .limit(1);
      linkedAttendeeId = byEmail?.[0]?.id ?? null;
    }

    if (!linkedAttendeeId) {
      const fallback = (profileRow?.full_name || "").trim().split(/\s+/);
      const first = (firstName || fallback[0] || email.split("@")[0]).trim();
      const last = (lastName || fallback.slice(1).join(" ") || "").trim();
      const { data: created } = await adminClient
        .from("attendees")
        .insert({ first_name: first, last_name: last, email, is_member: true })
        .select("id")
        .single();
      linkedAttendeeId = created?.id ?? null;
    }

    if (linkedAttendeeId && profileRow && profileRow.attendee_id !== linkedAttendeeId) {
      await adminClient
        .from("profiles")
        .update({ attendee_id: linkedAttendeeId })
        .eq("user_id", userId);
    }

    // Backfill profile name from the directory record when it's blank
    if (linkedAttendeeId && !(profileRow?.full_name || "").trim()) {
      const { data: att } = await adminClient
        .from("attendees")
        .select("first_name, last_name, phone")
        .eq("id", linkedAttendeeId)
        .maybeSingle();
      const fullName = `${att?.first_name || ""} ${att?.last_name || ""}`.trim();
      if (fullName) {
        await adminClient
          .from("profiles")
          .update({ full_name: fullName, phone: att?.phone ?? null })
          .eq("user_id", userId);
      }
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

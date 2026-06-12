import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const last10 = (p: string | null | undefined) =>
  (p || "").replace(/\D/g, "").slice(-10);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const note = body.note ? String(body.note).trim() : null;
    const preferredTeamIds: string[] = Array.isArray(body.preferredTeamIds) ? body.preferredTeamIds : [];
    const smsOptIn = !!body.smsOptIn;

    if (!firstName || !lastName) throw new Error("First and last name are required");
    if (!email && !phone) throw new Error("Email or phone is required");

    // Search for an existing attendee — email first, then phone last-10, then name fuzzy
    let attendeeId: string | null = null;
    let matched = false;

    if (email) {
      const { data } = await admin.from("attendees").select("id").ilike("email", email).limit(1).maybeSingle();
      if (data?.id) { attendeeId = data.id; matched = true; }
    }
    if (!attendeeId && phone) {
      const digits = last10(phone);
      if (digits.length === 10) {
        const { data } = await admin
          .from("attendees")
          .select("id, phone")
          .not("phone", "is", null);
        const found = (data || []).find((a: any) => last10(a.phone) === digits);
        if (found) { attendeeId = found.id; matched = true; }
      }
    }
    if (!attendeeId) {
      const { data } = await admin
        .from("attendees")
        .select("id")
        .ilike("first_name", firstName)
        .ilike("last_name", lastName)
        .limit(1)
        .maybeSingle();
      if (data?.id) { attendeeId = data.id; matched = true; }
    }

    const optInTs = smsOptIn && phone ? new Date().toISOString() : null;

    if (!attendeeId) {
      const { data: created, error } = await admin
        .from("attendees")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          is_member: false,
          tags: ["source:join-team"],
          sms_opt_in: !!optInTs,
          sms_opt_in_at: optInTs,
          sms_opt_in_source: optInTs ? "join_team_form" : null,
          sms_opt_in_text: optInTs
            ? "Yes, I agree to receive recurring text messages from House of Transformation Church about volunteering, training and team scheduling. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to unsubscribe."
            : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      attendeeId = created.id;
    } else {
      // Tag the attendee as having expressed interest in joining a team
      const { data: existing } = await admin.from("attendees").select("tags").eq("id", attendeeId).maybeSingle();
      const tags = new Set<string>([...(existing?.tags || []), "source:join-team"]);
      for (const tid of preferredTeamIds) tags.add(`team-pref:${tid}`);
      const patch: Record<string, unknown> = { tags: Array.from(tags) };
      if (optInTs) {
        patch.sms_opt_in = true;
        patch.sms_opt_in_at = optInTs;
        patch.sms_opt_in_source = "join_team_form";
      }
      await admin.from("attendees").update(patch).eq("id", attendeeId);
    }

    // Upsert volunteer_onboarding row at "interested" stage (skip if active row exists)
    const { data: existingOnb } = await admin
      .from("volunteer_onboarding")
      .select("id, preferred_team_ids")
      .eq("attendee_id", attendeeId)
      .is("completed_at", null)
      .maybeSingle();

    let onboardingId: string;
    if (existingOnb?.id) {
      const merged = Array.from(new Set([...(existingOnb.preferred_team_ids || []), ...preferredTeamIds]));
      await admin
        .from("volunteer_onboarding")
        .update({
          preferred_team_ids: merged,
          notes: note || undefined,
        })
        .eq("id", existingOnb.id);
      onboardingId = existingOnb.id;
    } else {
      const { data: ins, error } = await admin
        .from("volunteer_onboarding")
        .insert({
          attendee_id: attendeeId,
          stage: "interested",
          source: "join-team",
          preferred_team_ids: preferredTeamIds,
          notes: note,
        })
        .select("id")
        .single();
      if (error) throw error;
      onboardingId = ins.id;
    }

    const fullName = `${firstName} ${lastName}`;

    // Send invitation/confirmation email to the volunteer
    if (resendApiKey && email) {
      try {
        const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnon}`,
            "apikey": supabaseAnon,
          },
          body: JSON.stringify({
            to: email,
            to_name: fullName,
            related_attendee_id: attendeeId,
            subject: "Welcome to the HOTC team onboarding",
            html: `
              <h1>Thanks for stepping up, ${firstName}!</h1>
              <p>We've received your request to join the team at House of Transformation Church and added you to our volunteer onboarding pipeline.</p>
              <h2>What happens next</h2>
              <ol>
                <li>A member of our staff will review your sign-up and reach out personally.</li>
                <li>You'll be invited to a short training session so you know what to expect.</li>
                <li>Once training is complete, we'll match you with the right team and get you serving.</li>
              </ol>
              ${note ? `<p><strong>Your note to us:</strong><br/><em>${note.replace(/[<>&]/g, "")}</em></p>` : ""}
              <p>If anything changes or you have questions, just reply to this email — we'd love to hear from you.</p>
              <p>Welcome to the family,<br/>The HOTC Team</p>
            `,
          }),
        });
      } catch (e) {
        console.error("volunteer invite email failed", e);
      }
    }



    // Notify admins + staff team members
    try {
      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      const { data: staff } = await admin
        .from("team_members")
        .select("user_id, teams!inner(slug)")
        .eq("teams.slug", "staff");
      const recipientIds = new Set<string>([
        ...(admins ?? []).map((r: any) => r.user_id),
        ...(staff ?? []).map((r: any) => r.user_id),
      ]);
      if (recipientIds.size) {
        await admin.from("notifications").insert(
          Array.from(recipientIds).map((uid) => ({
            recipient_id: uid,
            type: "volunteer_interest",
            title: "New volunteer signup",
            body: `${fullName} wants to join the team${matched ? "" : " (new contact created)"}.`,
            url: "/admin?tab=volunteer-onboarding",
            data: { attendee_id: attendeeId, onboarding_id: onboardingId },
          })),
        );
      }

      if (resendApiKey && recipientIds.size) {
        const { data: profs } = await admin
          .from("profiles")
          .select("email")
          .in("user_id", Array.from(recipientIds));
        const toEmails = (profs || []).map((p: any) => p.email).filter(Boolean);
        if (toEmails.length) {
          const teamLines = preferredTeamIds.length
            ? `<li>Preferred teams: ${preferredTeamIds.length}</li>`
            : "";
          const html = `<div style="font-family:sans-serif;max-width:520px">
            <h2>New volunteer signup</h2>
            <p><strong>${fullName}</strong> signed up via /join-team.</p>
            <ul>
              ${email ? `<li>Email: ${email}</li>` : ""}
              ${phone ? `<li>Phone: ${phone}</li>` : ""}
              <li>${matched ? "Matched existing visitor record" : "Created new visitor record"}</li>
              ${teamLines}
            </ul>
            ${note ? `<p><em>${note.replace(/[<>&]/g, "")}</em></p>` : ""}
            <p>Review them in the Volunteer Onboarding pipeline.</p>
          </div>`;
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "HOTC <community@hotc.life>",
              to: toEmails,
              subject: `New volunteer signup: ${fullName}`,
              html,
            }),
          });
        }
      }
    } catch (e) {
      console.error("notify failed", e);
    }

    return new Response(
      JSON.stringify({ success: true, attendeeId, onboardingId, matched }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("register-volunteer-interest error", error);
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

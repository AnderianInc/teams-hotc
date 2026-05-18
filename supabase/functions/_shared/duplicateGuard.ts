// Shared duplicate-detection logic for edge functions.
// Uses the service-role Supabase client provided by caller.
// @ts-nocheck

export interface DuplicateInput {
  supabase: any;
  channel: "email" | "sms";
  toEmail?: string | null;
  toPhone?: string | null;
  attendeeId?: string | null;
  subject?: string | null;
  bodyPrefix?: string | null;
  sequenceId?: string | null;
  externalRecordId?: string | null;
  withinDays?: number;
}

export async function findRecentDuplicate(input: DuplicateInput) {
  const within = input.withinDays ?? 14;
  const since = new Date(Date.now() - within * 86400000).toISOString();
  const sb = input.supabase;

  // For sequence dispatches, prevent re-running the same sequence step ever.
  if (input.sequenceId && input.externalRecordId) {
    const { data } = await sb.from("outreach_sequence_runs")
      .select("id, sent_at, status")
      .eq("sequence_id", input.sequenceId)
      .eq("external_record_id", input.externalRecordId)
      .in("status", ["sent", "approved"])
      .limit(1);
    if (data && data.length > 0) {
      return { kind: "sequence", sentAt: data[0].sent_at, id: data[0].id };
    }
  }

  if (input.channel === "email" && input.toEmail) {
    let q = sb.from("email_log")
      .select("id, subject, sent_at")
      .eq("to_email", input.toEmail)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (input.subject) q = q.eq("subject", input.subject);
    const { data } = await q;
    if (data && data.length > 0) {
      return { kind: "email", sentAt: data[0].sent_at, id: data[0].id, subject: data[0].subject };
    }
  }

  if (input.channel === "sms" && input.toPhone) {
    const prefix = (input.bodyPrefix ?? "").slice(0, 60);
    const { data } = await sb.from("sms_log")
      .select("id, body, sent_at")
      .eq("to_phone", input.toPhone)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(5);
    if (data) {
      const hit = data.find((r: any) => !prefix || (r.body || "").slice(0, 60) === prefix);
      if (hit) return { kind: "sms", sentAt: hit.sent_at, id: hit.id };
    }
  }

  return null;
}

/**
 * Returns true if the contact has do_not_contact set (attendees OR profiles).
 */
export async function isDoNotContact(sb: any, attendeeId?: string | null, email?: string | null, phone?: string | null) {
  if (attendeeId) {
    const { data } = await sb.from("attendees")
      .select("do_not_contact")
      .eq("id", attendeeId)
      .maybeSingle();
    if (data?.do_not_contact) return true;
  }
  if (email) {
    const { data } = await sb.from("attendees")
      .select("do_not_contact")
      .eq("email", email)
      .limit(1);
    if (data && data.some((r: any) => r.do_not_contact)) return true;
    const { data: p } = await sb.from("profiles")
      .select("do_not_contact")
      .eq("email", email)
      .limit(1);
    if (p && p.some((r: any) => r.do_not_contact)) return true;
  }
  if (phone) {
    const { data } = await sb.from("attendees")
      .select("do_not_contact")
      .eq("phone", phone)
      .limit(1);
    if (data && data.some((r: any) => r.do_not_contact)) return true;
    const { data: p } = await sb.from("profiles")
      .select("do_not_contact")
      .eq("phone", phone)
      .limit(1);
    if (p && p.some((r: any) => r.do_not_contact)) return true;
  }
  return false;
}

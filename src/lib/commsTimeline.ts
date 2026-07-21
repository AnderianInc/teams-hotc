import { supabase } from "@/integrations/supabase/client";

export type CommsChannel = "email" | "sms" | "call" | "in_person" | "visit" | "note";
export type CommsSource = "manual" | "sequence" | "birthday" | "follow_up" | "visitor_confirm" | "system";

export interface CommsItem {
  id: string;
  ts: string;
  channel: CommsChannel;
  source: CommsSource;
  subject: string | null;
  preview: string | null;
  body: string | null;
  recipient: string | null;
  sentBy: string | null;
  status: string | null;
  refType: "email_log" | "sms_log" | "outreach_run" | "follow_up_activity";
  refId: string;
}

interface FetchInput {
  attendeeId?: string | null;
  email?: string | null;
  phone?: string | null;
}

function safePreview(text: string | null | undefined, max = 140): string | null {
  if (!text) return null;
  const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

/**
 * Pull a contact's full communications history across email_log, sms_log,
 * outreach_sequence_runs, and follow_up_activities.
 */
export async function fetchCommsTimeline(input: FetchInput): Promise<CommsItem[]> {
  const { attendeeId, email, phone } = input;
  const items: CommsItem[] = [];

  // 1. Email log
  let emailQuery = supabase
    .from("email_log")
    .select("id, to_email, to_name, subject, body_html, sent_at, sent_by, status, related_attendee_id")
    .order("sent_at", { ascending: false })
    .limit(200);
  if (attendeeId) {
    emailQuery = emailQuery.or(`related_attendee_id.eq.${attendeeId}${email ? `,to_email.eq.${email}` : ""}`);
  } else if (email) {
    emailQuery = emailQuery.eq("to_email", email);
  } else {
    emailQuery = emailQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  // 2. SMS log
  let smsQuery = supabase
    .from("sms_log")
    .select("id, to_phone, to_name, body, sent_at, sent_by, status, related_attendee_id")
    .order("sent_at", { ascending: false })
    .limit(200);
  if (attendeeId) {
    smsQuery = smsQuery.or(`related_attendee_id.eq.${attendeeId}${phone ? `,to_phone.eq.${phone}` : ""}`);
  } else if (phone) {
    smsQuery = smsQuery.eq("to_phone", phone);
  } else {
    smsQuery = smsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  // 3. Outreach runs (via external_records.attendee_id)
  let outreachQuery = supabase
    .from("outreach_sequence_runs")
    .select("id, subject, body, recipient, channel, status, sent_at, scheduled_for, external_records!inner(attendee_id)")
    .order("sent_at", { ascending: false })
    .limit(200);
  if (attendeeId) {
    outreachQuery = outreachQuery.eq("external_records.attendee_id", attendeeId);
  } else {
    outreachQuery = outreachQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  // 4. Follow-up activities
  let activityQuery: any = null;
  if (attendeeId) {
    activityQuery = (supabase.from as any)("follow_up_activities")
      .select("id, activity_type, content, created_at, actor_id, follow_ups!inner(attendee_id)")
      .eq("follow_ups.attendee_id", attendeeId)
      .order("created_at", { ascending: false })
      .limit(200);
  }

  const [emailRes, smsRes, outreachRes, activityRes] = await Promise.all([
    emailQuery,
    smsQuery,
    outreachQuery,
    activityQuery ?? Promise.resolve({ data: [], error: null }),
  ]);

  (emailRes.data || []).forEach((r: any) => items.push({
    id: `email-${r.id}`,
    ts: r.sent_at,
    channel: "email",
    source: "manual",
    subject: r.subject,
    preview: safePreview(r.body_html),
    body: r.body_html,
    recipient: r.to_email,
    sentBy: r.sent_by,
    status: r.status,
    refType: "email_log",
    refId: r.id,
  }));

  (smsRes.data || []).forEach((r: any) => items.push({
    id: `sms-${r.id}`,
    ts: r.sent_at,
    channel: "sms",
    source: "manual",
    subject: null,
    preview: safePreview(r.body),
    body: r.body,
    recipient: r.to_phone,
    sentBy: r.sent_by,
    status: r.status,
    refType: "sms_log",
    refId: r.id,
  }));

  (outreachRes.data || []).forEach((r: any) => items.push({
    id: `outreach-${r.id}`,
    ts: r.sent_at || r.scheduled_for,
    channel: (r.channel as CommsChannel) || "email",
    source: "sequence",
    subject: r.subject,
    preview: safePreview(r.body),
    body: r.body,
    recipient: r.recipient,
    sentBy: null,
    status: r.status,
    refType: "outreach_run",
    refId: r.id,
  }));

  (activityRes.data || []).forEach((r: any) => items.push({
    id: `activity-${r.id}`,
    ts: r.created_at,
    channel: (r.activity_type as CommsChannel) || "note",
    source: "follow_up",
    subject: null,
    preview: safePreview(r.content),
    body: r.content,
    recipient: null,
    sentBy: r.actor_id,
    status: null,
    refType: "follow_up_activity",
    refId: r.id,
  }));

  const valid = items.filter((i) => i.ts && !isNaN(new Date(i.ts).getTime()));
  valid.sort((a, b) => (new Date(b.ts).getTime() - new Date(a.ts).getTime()));
  return valid;

}

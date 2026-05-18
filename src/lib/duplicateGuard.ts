import { supabase } from "@/integrations/supabase/client";

export interface DuplicateCheckInput {
  attendeeId?: string | null;
  toEmail?: string | null;
  toPhone?: string | null;
  channel: "email" | "sms";
  subject?: string | null;
  bodyPrefix?: string | null;
  withinDays?: number;
}

export interface DuplicateHit {
  id: string;
  channel: "email" | "sms";
  subject: string | null;
  sentAt: string;
  source: "email_log" | "sms_log";
}

/**
 * Client-side duplicate check used by composers to warn before re-sending the same message.
 * Returns the most recent matching prior send, or null.
 */
export async function findRecentDuplicate(input: DuplicateCheckInput): Promise<DuplicateHit | null> {
  const within = input.withinDays ?? 7;
  const since = new Date(Date.now() - within * 86400000).toISOString();

  if (input.channel === "email" && input.toEmail) {
    let q = supabase
      .from("email_log")
      .select("id, subject, sent_at")
      .eq("to_email", input.toEmail)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (input.subject) q = q.eq("subject", input.subject);
    const { data } = await q;
    if (data && data.length > 0) {
      return {
        id: data[0].id,
        channel: "email",
        subject: data[0].subject,
        sentAt: data[0].sent_at,
        source: "email_log",
      };
    }
  }

  if (input.channel === "sms" && input.toPhone) {
    const prefix = (input.bodyPrefix ?? "").slice(0, 60);
    let q = supabase
      .from("sms_log")
      .select("id, body, sent_at")
      .eq("to_phone", input.toPhone)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(5);
    const { data } = await q;
    if (data) {
      const hit = data.find((r: any) => !prefix || (r.body || "").slice(0, 60) === prefix);
      if (hit) {
        return {
          id: hit.id,
          channel: "sms",
          subject: (hit as any).body?.slice(0, 60) ?? null,
          sentAt: hit.sent_at,
          source: "sms_log",
        };
      }
    }
  }

  return null;
}

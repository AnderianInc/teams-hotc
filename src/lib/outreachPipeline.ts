import { supabase } from "@/integrations/supabase/client";

/**
 * Stop all automated outreach for a given external_record:
 *  - marks the source record `cancelled` so future steps stop being scheduled
 *  - marks any not-yet-sent runs (pending_approval / approved) as skipped
 */
export async function cancelOutreachForRecord(recordId: string, reason = "Cancelled by admin") {
  const { error: recErr } = await supabase
    .from("external_records")
    .update({ status: "cancelled" })
    .eq("id", recordId);
  if (recErr) throw recErr;

  const { error: runErr } = await supabase
    .from("outreach_sequence_runs")
    .update({ status: "skipped", detail: reason })
    .eq("external_record_id", recordId)
    .in("status", ["pending_approval", "approved"]);
  if (runErr) throw runErr;
}

/**
 * Stop all automated outreach tied to an attendee — used when removing the
 * person from the directory so they never get re-queued.
 *  - cancels every external_record linked to the attendee
 *  - skips any not-yet-sent runs for those records
 *  - cancels any pending coffee-with-PK / pending_email_approvals
 */
export async function cancelOutreachForAttendee(attendeeId: string, reason = "Removed from directory") {
  const { data: recs } = await supabase
    .from("external_records")
    .select("id")
    .eq("attendee_id", attendeeId);
  const ids = (recs ?? []).map((r: any) => r.id);

  if (ids.length) {
    await supabase
      .from("external_records")
      .update({ status: "cancelled" })
      .in("id", ids);
    await supabase
      .from("outreach_sequence_runs")
      .update({ status: "skipped", detail: reason })
      .in("external_record_id", ids)
      .in("status", ["pending_approval", "approved"]);
  }

  await supabase
    .from("pending_email_approvals")
    .update({ status: "cancelled", notes: reason })
    .eq("attendee_id", attendeeId)
    .eq("status", "pending");
}

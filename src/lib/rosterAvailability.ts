import { supabase } from "@/integrations/supabase/client";

type BlockedDateRange = {
  blocked_date: string;
  end_date: string | null;
  reason: string | null;
};

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatBlockedRange = (block: BlockedDateRange) => {
  const endDate = block.end_date || block.blocked_date;
  if (endDate === block.blocked_date) return formatDate(block.blocked_date);
  return `${formatDate(block.blocked_date)} – ${formatDate(endDate)}`;
};

export async function assertUserAvailableForRoster(
  userId: string,
  scheduledDate: string,
  displayName = "This volunteer",
) {
  if (!userId || !scheduledDate) return;

  const { data, error } = await supabase
    .from("volunteer_blocked_dates" as any)
    .select("blocked_date, end_date, reason")
    .eq("user_id", userId)
    .lte("blocked_date", scheduledDate);

  if (error) throw error;

  const blockingRange = ((data || []) as unknown as BlockedDateRange[]).find((block) => {
    const endDate = block.end_date || block.blocked_date;
    return block.blocked_date <= scheduledDate && endDate >= scheduledDate;
  });

  if (blockingRange) {
    const reason = blockingRange.reason ? ` Reason: ${blockingRange.reason}` : "";
    throw new Error(
      `${displayName} is unavailable on ${formatDate(scheduledDate)} because ${formatBlockedRange(blockingRange)} is blocked.${reason}`,
    );
  }
}

export function getRosterResponseLabel(status?: string | null) {
  if (status === "accepted") return "Accepted";
  if (status === "declined") return "Declined";
  return "Pending";
}
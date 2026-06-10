import { supabase } from "@/integrations/supabase/client";
import { cancelOutreachForAttendee } from "@/lib/outreachPipeline";

export interface DeletableEntry {
  id: string;
  source?: "attendee" | "family";
  isVolunteerOnly: boolean;
}

/**
 * Delete a single directory entry (individual). Family entries are skipped.
 * Throws on error so callers can aggregate per-item failures.
 */
export async function deleteDirectoryEntry(entry: DeletableEntry): Promise<void> {
  if (entry.source === "family") return;

  if (entry.isVolunteerOnly) {
    await supabase.from("team_members").delete().eq("user_id", entry.id);
    const { error } = await supabase.from("profiles").delete().eq("user_id", entry.id);
    if (error) throw error;
    return;
  }

  await cancelOutreachForAttendee(entry.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("attendee_id", entry.id)
    .maybeSingle();

  if (profile) {
    await supabase.from("team_members").delete().eq("user_id", profile.user_id);
    await supabase.from("profiles").delete().eq("user_id", profile.user_id);
  }

  const { error } = await supabase.from("attendees").delete().eq("id", entry.id);
  if (error) throw error;
}

/**
 * Bulk delete entries with a small concurrency. Returns successes/failures.
 */
export async function bulkDeleteDirectoryEntries(
  entries: DeletableEntry[],
  concurrency = 4,
): Promise<{ succeeded: string[]; failed: { id: string; message: string }[] }> {
  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];
  const queue = [...entries];

  async function worker() {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) return;
      try {
        await deleteDirectoryEntry(entry);
        succeeded.push(entry.id);
      } catch (e: any) {
        failed.push({ id: entry.id, message: e?.message || "Unknown error" });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return { succeeded, failed };
}

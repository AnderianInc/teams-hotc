import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cancelOutreachForAttendee } from "@/lib/outreachPipeline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Props {
  entryId: string;
  entryName: string;
  isVolunteerOnly: boolean;
  onDeleted: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DirectoryDeleteButton({ entryId, entryName, isVolunteerOnly, onDeleted, open, onOpenChange }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (isVolunteerOnly) {
        // Remove team memberships first, then profile
        await supabase.from("team_members").delete().eq("user_id", entryId);
        const { error } = await supabase.from("profiles").delete().eq("user_id", entryId);
        if (error) throw error;
      } else {
        // For attendees: also clean up linked profile & team memberships
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("attendee_id", entryId)
          .maybeSingle();

        if (profile) {
          await supabase.from("team_members").delete().eq("user_id", profile.user_id);
          await supabase.from("profiles").delete().eq("user_id", profile.user_id);
        }

        const { error } = await supabase.from("attendees").delete().eq("id", entryId);
        if (error) throw error;
      }
      toast.success(`${entryName} has been removed`);
      onDeleted();
    } catch (e: any) {
      toast.error("Failed to delete: " + e.message);
    }
    setDeleting(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entryName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this person from the directory and any team memberships. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

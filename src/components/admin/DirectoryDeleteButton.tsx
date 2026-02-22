import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  entryId: string;
  entryName: string;
  isVolunteerOnly: boolean;
  onDeleted: () => void;
}

export default function DirectoryDeleteButton({ entryId, entryName, isVolunteerOnly, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    if (isVolunteerOnly) {
      // No attendee record — delete the profile instead
      const { error } = await supabase.from("profiles").delete().eq("user_id", entryId);
      if (error) {
        toast.error("Failed to delete: " + error.message);
      } else {
        toast.success(`${entryName} has been removed`);
        onDeleted();
      }
    } else {
      const { error } = await supabase.from("attendees").delete().eq("id", entryId);
      if (error) {
        toast.error("Failed to delete: " + error.message);
      } else {
        toast.success(`${entryName} has been removed`);
        onDeleted();
      }
    }
    setDeleting(false);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" disabled={deleting}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entryName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this person from the directory. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

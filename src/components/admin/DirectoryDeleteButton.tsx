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
    if (isVolunteerOnly) {
      toast.error("This person is a volunteer-only profile. Remove them via Team Management instead.");
      return;
    }
    setDeleting(true);
    const { error } = await supabase.from("attendees").delete().eq("id", entryId);
    if (error) {
      toast.error("Failed to delete: " + error.message);
    } else {
      toast.success(`${entryName} has been removed`);
      onDeleted();
    }
    setDeleting(false);
  };

  if (isVolunteerOnly) {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground"
        onClick={() => toast.info("This volunteer must be removed via Team Management.")}
        title="Remove via Team Management"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }

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

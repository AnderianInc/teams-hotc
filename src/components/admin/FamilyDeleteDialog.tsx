import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  familyId: string;
  familyName: string;
  onDeleted: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FamilyDeleteDialog({ familyId, familyName, onDeleted, open, onOpenChange }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete children first (FK constraint), then the family
      const { error: childErr } = await supabase.from("children").delete().eq("family_id", familyId);
      if (childErr) throw childErr;

      const { error: famErr } = await supabase.from("families").delete().eq("id", familyId);
      if (famErr) throw famErr;

      toast.success(`${familyName} family has been removed`);
      onDeleted();
    } catch (e: any) {
      toast.error("Failed to delete family: " + e.message);
    }
    setDeleting(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {familyName} Family?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this family and all their children from the system. This action cannot be undone.
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

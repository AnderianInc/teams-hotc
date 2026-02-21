import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

interface EditFamilyProps {
  familyId: string;
  onUpdated?: () => void;
}

export default function EditFamily({ familyId, onUpdated }: EditFamilyProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: family } = useQuery({
    queryKey: ["family", familyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("families").select("*").eq("id", familyId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: children } = useQuery({
    queryKey: ["family-children", familyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("children").select("*").eq("family_id", familyId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const [familyForm, setFamilyForm] = useState({
    family_name: "",
    parent1_name: "",
    parent1_phone: "",
    parent2_name: "",
    parent2_phone: "",
  });
  const [childForms, setChildForms] = useState<any[]>([]);

  useEffect(() => {
    if (family) {
      setFamilyForm({
        family_name: family.family_name,
        parent1_name: family.parent1_name,
        parent1_phone: family.parent1_phone,
        parent2_name: family.parent2_name || "",
        parent2_phone: family.parent2_phone || "",
      });
    }
  }, [family]);

  useEffect(() => {
    if (children) {
      setChildForms(children.map((c) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        date_of_birth: c.date_of_birth || "",
        grade_group: c.grade_group || "",
        allergies: c.allergies || "",
        medical_notes: c.medical_notes || "",
      })));
    }
  }, [children]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Update family
      const { error: famErr } = await supabase
        .from("families")
        .update({
          family_name: familyForm.family_name,
          parent1_name: familyForm.parent1_name,
          parent1_phone: familyForm.parent1_phone,
          parent2_name: familyForm.parent2_name || null,
          parent2_phone: familyForm.parent2_phone || null,
        })
        .eq("id", familyId);
      if (famErr) throw famErr;

      // Update each child
      for (const child of childForms) {
        const { error } = await supabase
          .from("children")
          .update({
            first_name: child.first_name,
            last_name: child.last_name,
            date_of_birth: child.date_of_birth || null,
            grade_group: child.grade_group || null,
            allergies: child.allergies || null,
            medical_notes: child.medical_notes || null,
          })
          .eq("id", child.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Family details updated!");
      queryClient.invalidateQueries({ queryKey: ["family", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-children", familyId] });
      queryClient.invalidateQueries({ queryKey: ["children-search"] });
      setOpen(false);
      onUpdated?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateChild = (index: number, field: string, value: string) => {
    setChildForms((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Pencil className="h-4 w-4" />
          Edit Family
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Family Details</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-6"
        >
          {/* Family info */}
          <div className="space-y-3">
            <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">Family</h3>
            <div className="space-y-1">
              <Label>Family Name</Label>
              <Input value={familyForm.family_name} onChange={(e) => setFamilyForm((f) => ({ ...f, family_name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Parent Name</Label>
                <Input value={familyForm.parent1_name} onChange={(e) => setFamilyForm((f) => ({ ...f, parent1_name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input type="tel" value={familyForm.parent1_phone} onChange={(e) => setFamilyForm((f) => ({ ...f, parent1_phone: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>2nd Parent</Label>
                <Input value={familyForm.parent2_name} onChange={(e) => setFamilyForm((f) => ({ ...f, parent2_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input type="tel" value={familyForm.parent2_phone} onChange={(e) => setFamilyForm((f) => ({ ...f, parent2_phone: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Children */}
          {childForms.map((child, i) => (
            <div key={child.id} className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Child {i + 1}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  <Input value={child.first_name} onChange={(e) => updateChild(i, "first_name", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input value={child.last_name} onChange={(e) => updateChild(i, "last_name", e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Date of Birth</Label>
                  <Input type="date" value={child.date_of_birth} onChange={(e) => updateChild(i, "date_of_birth", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Grade/Age Group</Label>
                  <Input value={child.grade_group} onChange={(e) => updateChild(i, "grade_group", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Allergies</Label>
                <Input value={child.allergies} onChange={(e) => updateChild(i, "allergies", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Medical Notes</Label>
                <Input value={child.medical_notes} onChange={(e) => updateChild(i, "medical_notes", e.target.value)} />
              </div>
            </div>
          ))}

          <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

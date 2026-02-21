import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Plus, X } from "lucide-react";

interface RegisterChildProps {
  onBack: () => void;
  onRegistered: (child: any) => void;
}

interface SiblingEntry {
  firstName: string;
  lastName: string;
  dob: string;
  gradeGroup: string;
  allergies: string;
  medicalNotes: string;
}

const emptySibling = (): SiblingEntry => ({
  firstName: "",
  lastName: "",
  dob: "",
  gradeGroup: "",
  allergies: "",
  medicalNotes: "",
});

export default function RegisterChild({ onBack, onRegistered }: RegisterChildProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    gradeGroup: "",
    allergies: "",
    medicalNotes: "",
    familyName: "",
    parent1Name: "",
    parent1Phone: "",
    parent2Name: "",
    parent2Phone: "",
  });
  const [siblings, setSiblings] = useState<SiblingEntry[]>([]);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const updateSibling = (index: number, field: keyof SiblingEntry, value: string) => {
    setSiblings((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addSibling = () => {
    setSiblings((prev) => [...prev, { ...emptySibling(), lastName: form.lastName }]);
  };

  const removeSibling = (index: number) => {
    setSiblings((prev) => prev.filter((_, i) => i !== index));
  };

  const register = useMutation({
    mutationFn: async () => {
      // Create family
      const { data: family, error: famErr } = await supabase
        .from("families")
        .insert({
          family_name: form.familyName || form.lastName,
          parent1_name: form.parent1Name,
          parent1_phone: form.parent1Phone,
          parent2_name: form.parent2Name || null,
          parent2_phone: form.parent2Phone || null,
        })
        .select()
        .single();
      if (famErr) throw famErr;

      // Build all children rows (primary + siblings)
      const allChildren = [
        {
          family_id: family.id,
          first_name: form.firstName,
          last_name: form.lastName,
          date_of_birth: form.dob || null,
          grade_group: form.gradeGroup || null,
          allergies: form.allergies || null,
          medical_notes: form.medicalNotes || null,
        },
        ...siblings.map((s) => ({
          family_id: family.id,
          first_name: s.firstName,
          last_name: s.lastName || form.lastName,
          date_of_birth: s.dob || null,
          grade_group: s.gradeGroup || null,
          allergies: s.allergies || null,
          medical_notes: s.medicalNotes || null,
        })),
      ];

      const { data: children, error: childErr } = await supabase
        .from("children")
        .insert(allChildren)
        .select("id, first_name, last_name, date_of_birth, grade_group, allergies, family_id, families(family_name, parent1_name, parent1_phone)");
      if (childErr) throw childErr;

      // Return first child for check-in flow
      return children[0];
    },
    onSuccess: (child) => {
      const count = 1 + siblings.length;
      toast.success(`${count} child${count > 1 ? "ren" : ""} registered!`);
      queryClient.invalidateQueries({ queryKey: ["children-search"] });
      onRegistered(child);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ChildFields = ({
    label,
    data,
    onChange,
    onRemove,
  }: {
    label: string;
    data: { firstName: string; lastName: string; dob: string; gradeGroup: string; allergies: string; medicalNotes: string };
    onChange: (field: string, value: string) => void;
    onRemove?: () => void;
  }) => (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          {label}
        </h3>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>First Name</Label>
          <Input value={data.firstName} onChange={(e) => onChange("firstName", e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Last Name</Label>
          <Input value={data.lastName} onChange={(e) => onChange("lastName", e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Date of Birth</Label>
          <Input type="date" value={data.dob} onChange={(e) => onChange("dob", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Grade/Age Group</Label>
          <Input placeholder="e.g. Pre-K" value={data.gradeGroup} onChange={(e) => onChange("gradeGroup", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Allergies</Label>
        <Input placeholder="e.g. Peanuts, dairy" value={data.allergies} onChange={(e) => onChange("allergies", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Medical Notes</Label>
        <Textarea placeholder="Any other medical info..." value={data.medicalNotes} onChange={(e) => onChange("medicalNotes", e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="max-w-lg space-y-4">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Register New Family</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              register.mutate();
            }}
            className="space-y-6"
          >
            {/* Parent / Guardian */}
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Parent / Guardian
              </h3>
              <div className="space-y-1">
                <Label>Family Name</Label>
                <Input placeholder="Defaults to child's last name" value={form.familyName} onChange={(e) => update("familyName", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Parent Name</Label>
                  <Input value={form.parent1Name} onChange={(e) => update("parent1Name", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input type="tel" value={form.parent1Phone} onChange={(e) => update("parent1Phone", e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>2nd Parent (optional)</Label>
                  <Input value={form.parent2Name} onChange={(e) => update("parent2Name", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input type="tel" value={form.parent2Phone} onChange={(e) => update("parent2Phone", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Primary child */}
            <ChildFields
              label="Child Information"
              data={form}
              onChange={(field, value) => update(field, value)}
            />

            {/* Siblings */}
            {siblings.map((sib, i) => (
              <ChildFields
                key={i}
                label={`Sibling ${i + 1}`}
                data={sib}
                onChange={(field, value) => updateSibling(i, field as keyof SiblingEntry, value)}
                onRemove={() => removeSibling(i)}
              />
            ))}

            <Button type="button" variant="outline" className="w-full gap-2" onClick={addSibling}>
              <Plus className="h-4 w-4" />
              Add Sibling
            </Button>

            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending ? "Registering..." : `Register${siblings.length > 0 ? ` ${1 + siblings.length} Children` : ""} & Check In`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

interface RegisterChildProps {
  onBack: () => void;
  onRegistered: (child: any) => void;
}

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

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const register = useMutation({
    mutationFn: async () => {
      // Create family first
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

      // Create child
      const { data: child, error: childErr } = await supabase
        .from("children")
        .insert({
          family_id: family.id,
          first_name: form.firstName,
          last_name: form.lastName,
          date_of_birth: form.dob || null,
          grade_group: form.gradeGroup || null,
          allergies: form.allergies || null,
          medical_notes: form.medicalNotes || null,
        })
        .select("id, first_name, last_name, date_of_birth, grade_group, allergies, family_id, families(family_name, parent1_name, parent1_phone)")
        .single();
      if (childErr) throw childErr;
      return child;
    },
    onSuccess: (child) => {
      toast.success("Child registered!");
      queryClient.invalidateQueries({ queryKey: ["children-search"] });
      onRegistered(child);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-lg space-y-4">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Register New Child</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              register.mutate();
            }}
            className="space-y-6"
          >
            {/* Child info */}
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Child Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>First Name</Label>
                  <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Date of Birth</Label>
                  <Input type="date" value={form.dob} onChange={(e) => update("dob", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Grade/Age Group</Label>
                  <Input placeholder="e.g. Pre-K" value={form.gradeGroup} onChange={(e) => update("gradeGroup", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Medical */}
            <div className="space-y-3">
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Medical
              </h3>
              <div className="space-y-1">
                <Label>Allergies</Label>
                <Input placeholder="e.g. Peanuts, dairy" value={form.allergies} onChange={(e) => update("allergies", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Medical Notes</Label>
                <Textarea placeholder="Any other medical info..." value={form.medicalNotes} onChange={(e) => update("medicalNotes", e.target.value)} />
              </div>
            </div>

            {/* Parent */}
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

            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending ? "Registering..." : "Register & Check In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

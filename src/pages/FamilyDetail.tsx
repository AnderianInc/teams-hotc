import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO, differenceInYears } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Save, Loader2, Users, Phone, User, Pencil, X, Calendar, AlertTriangle,
} from "lucide-react";

interface FamilyData {
  id: string;
  family_name: string;
  parent1_name: string;
  parent1_phone: string;
  parent2_name: string | null;
  parent2_phone: string | null;
}

interface ChildData {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  grade_group: string | null;
  allergies: string | null;
  medical_notes: string | null;
}

export default function FamilyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [children, setChildren] = useState<ChildData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [familyForm, setFamilyForm] = useState<FamilyData | null>(null);
  const [childForms, setChildForms] = useState<ChildData[]>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [famRes, childRes] = await Promise.all([
      supabase.from("families").select("*").eq("id", id).maybeSingle(),
      supabase.from("children").select("*").eq("family_id", id).order("created_at"),
    ]);
    if (famRes.data) {
      setFamily(famRes.data);
      setFamilyForm(famRes.data);
    }
    const kids = childRes.data || [];
    setChildren(kids);
    setChildForms(kids.map((c) => ({ ...c })));
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!familyForm || !id) return;
    setSaving(true);
    const { error: famErr } = await supabase.from("families").update({
      family_name: familyForm.family_name,
      parent1_name: familyForm.parent1_name,
      parent1_phone: familyForm.parent1_phone,
      parent2_name: familyForm.parent2_name || null,
      parent2_phone: familyForm.parent2_phone || null,
    }).eq("id", id);

    if (famErr) {
      toast.error("Failed to save family: " + famErr.message);
      setSaving(false);
      return;
    }

    for (const child of childForms) {
      const { error } = await supabase.from("children").update({
        first_name: child.first_name,
        last_name: child.last_name,
        date_of_birth: child.date_of_birth || null,
        grade_group: child.grade_group || null,
        allergies: child.allergies || null,
        medical_notes: child.medical_notes || null,
      }).eq("id", child.id);
      if (error) {
        toast.error(`Failed to save ${child.first_name}: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    toast.success("Family updated");
    setEditing(false);
    fetchData();
    setSaving(false);
  };

  const updateFamily = (field: keyof FamilyData, value: string) =>
    setFamilyForm((f) => f ? { ...f, [field]: value } : f);

  const updateChild = (index: number, field: keyof ChildData, value: string) =>
    setChildForms((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!family || !familyForm) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Directory
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Family not found.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Directory
        </Button>
        {isAdmin && !editing && (
          <Button onClick={() => setEditing(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Edit Family
          </Button>
        )}
        {isAdmin && editing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setFamilyForm(family); setChildForms(children.map((c) => ({ ...c }))); setEditing(false); }}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Family Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-xl">{family.family_name} Family</CardTitle>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline">Kids Ministry</Badge>
                <Badge variant="secondary">{children.length} {children.length === 1 ? "child" : "children"}</Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Parents */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Parents / Guardians</h3>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Parent 1 Name</Label>
                    <Input value={familyForm.parent1_name} onChange={(e) => updateFamily("parent1_name", e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input type="tel" value={familyForm.parent1_phone} onChange={(e) => updateFamily("parent1_phone", e.target.value)} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Parent 2 Name</Label>
                    <Input value={familyForm.parent2_name || ""} onChange={(e) => updateFamily("parent2_name", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input type="tel" value={familyForm.parent2_phone || ""} onChange={(e) => updateFamily("parent2_phone", e.target.value)} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{family.parent1_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {family.parent1_phone}</p>
                  </div>
                </div>
                {family.parent2_name && (
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{family.parent2_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {family.parent2_phone || "—"}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Children Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-4 w-4" /> Children
          </CardTitle>
          <CardDescription>{children.length} registered {children.length === 1 ? "child" : "children"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(editing ? childForms : children).map((child, i) => {
            const age = child.date_of_birth ? differenceInYears(new Date(), parseISO(child.date_of_birth)) : null;
            return (
              <div key={child.id} className="rounded-lg border border-border p-4 space-y-3">
                {editing ? (
                  <>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Child {i + 1}</h4>
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
                        <Input type="date" value={child.date_of_birth || ""} onChange={(e) => updateChild(i, "date_of_birth", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Grade/Age Group</Label>
                        <Input value={child.grade_group || ""} onChange={(e) => updateChild(i, "grade_group", e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Allergies</Label>
                      <Input value={child.allergies || ""} onChange={(e) => updateChild(i, "allergies", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Medical Notes</Label>
                      <Input value={child.medical_notes || ""} onChange={(e) => updateChild(i, "medical_notes", e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{child.first_name} {child.last_name}</p>
                      <div className="flex gap-2 flex-wrap">
                        {child.date_of_birth && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(child.date_of_birth), "MMM d, yyyy")}
                            {age !== null && ` (age ${age})`}
                          </span>
                        )}
                        {child.grade_group && <Badge variant="outline" className="text-xs">{child.grade_group}</Badge>}
                      </div>
                      {child.allergies && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> {child.allergies}
                        </p>
                      )}
                      {child.medical_notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">Medical: {child.medical_notes}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {children.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No children registered</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import TeamMembershipEditor from "@/components/teams/TeamMembershipEditor";

interface DirectoryEntry {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  date_of_birth: string | null;
  isVolunteer: boolean;
  isVolunteerOnly: boolean;
  tags: string[] | null;
  teamNames: string[];
  source?: "attendee" | "family";
}

interface Props {
  entry: DirectoryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export default function DirectoryEditDialog({ entry, open, onOpenChange, onUpdated }: Props) {
  const [form, setForm] = useState({
    first_name: entry.first_name,
    last_name: entry.last_name,
    email: entry.email || "",
    phone: entry.phone || "",
    date_of_birth: entry.date_of_birth || "",
    is_member: entry.is_member,
  });
  const [saving, setSaving] = useState(false);

  // Find the user_id for this entry (needed for team management)
  const isVolunteerOnly = entry.isVolunteerOnly;

  // Get user_id: for volunteerOnly it's entry.id, for attendees we look up profile
  const { data: profileData } = useQuery({
    queryKey: ["profile-for-entry", entry.id, entry.isVolunteerOnly],
    queryFn: async () => {
      if (isVolunteerOnly) {
        return { user_id: entry.id };
      }
      // Look up profile by attendee_id
      const { data } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("attendee_id", entry.id)
        .maybeSingle();
      return data;
    },
    enabled: open && entry.source !== "family",
  });

  const userId = profileData?.user_id;

  const update = (field: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (entry.source === "family") {
        const { error } = await supabase
          .from("children")
          .update({
            first_name: form.first_name,
            last_name: form.last_name,
            date_of_birth: form.date_of_birth || null,
          })
          .eq("id", entry.id);
        if (error) throw error;
      } else if (entry.isVolunteerOnly) {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: `${form.first_name} ${form.last_name}`.trim(),
            email: form.email || "",
            phone: form.phone || null,
            date_of_birth: form.date_of_birth || null,
          })
          .eq("user_id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendees")
          .update({
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email || null,
            phone: form.phone || null,
            date_of_birth: form.date_of_birth || null,
            is_member: form.is_member,
          })
          .eq("id", entry.id);
        if (error) throw error;
      }
      toast.success("Entry updated");
      onUpdated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Failed to update: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {entry.first_name} {entry.last_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First Name</Label>
              <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Last Name</Label>
              <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </div>
          </div>
          {entry.source !== "family" && (
            <>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>Date of Birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} />
          </div>
          {entry.source !== "family" && !entry.isVolunteerOnly && (
            <div className="flex items-center gap-3">
              <Switch checked={form.is_member} onCheckedChange={(v) => update("is_member", v)} />
              <Label>Member</Label>
            </div>
          )}

          {/* Team Management Section */}
          {entry.source !== "family" && userId && (
            <>
              <Separator />
              <TeamMembershipEditor userId={userId} enabled={open} onChanged={onUpdated} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

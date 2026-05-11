import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: {
    user_id: string;
    full_name: string;
    email: string;
  } | null;
}

export default function EditVolunteerDialog({ open, onOpenChange, profile }: Props) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile || !open) return;
    setFullName(profile.full_name || "");
    setEmail(profile.email || "");
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      setPhone(data?.phone || "");
    })();
  }, [profile, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      setLoading(true);
      // Update profile
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ full_name: fullName, email, phone })
        .eq("user_id", profile.user_id);
      if (pErr) throw pErr;

      // Sync linked attendee (split name, update email/phone)
      const { data: prof } = await supabase
        .from("profiles")
        .select("attendee_id")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (prof?.attendee_id) {
        const parts = fullName.trim().split(/\s+/);
        const first = parts[0] || "";
        const last = parts.slice(1).join(" ") || "";
        await supabase
          .from("attendees")
          .update({ first_name: first, last_name: last, email, phone })
          .eq("id", prof.attendee_id);
      }
    },
    onSuccess: () => {
      toast.success("Volunteer updated");
      qc.invalidateQueries({ queryKey: ["all-profiles-with-teams"] });
      onOpenChange(false);
      setLoading(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setLoading(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Volunteer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Note: This updates the directory contact email. The user's sign-in email is managed separately by them.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={loading || !fullName.trim()}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

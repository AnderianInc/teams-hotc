import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertTriangle, Printer } from "lucide-react";

interface CheckInConfirmProps {
  child: {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    grade_group: string | null;
    allergies: string | null;
    families: {
      family_name: string;
      parent1_name: string;
      parent1_phone: string;
    };
  };
  onBack: () => void;
}

export default function CheckInConfirm({ child, onBack }: CheckInConfirmProps) {
  const { user } = useAuth();
  const [success, setSuccess] = useState(false);

  // Find matching room by grade_group
  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("*");
      return data || [];
    },
  });

  // Get active service
  const { data: activeService } = useQuery({
    queryKey: ["active-service"],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Auto-assign room based on grade
  const assignedRoom = rooms?.find(
    (r) => r.grade_group && child.grade_group && r.grade_group.toLowerCase() === child.grade_group.toLowerCase()
  );

  const checkIn = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("check_ins").insert({
        child_id: child.id,
        service_id: activeService?.id || null as any,
        room_id: assignedRoom?.id || null,
        checked_in_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSuccess(true);
      toast.success(`${child.first_name} checked in!`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold">
            {child.first_name} is checked in!
          </h2>
          {assignedRoom && (
            <p className="text-muted-foreground mt-1">Room: {assignedRoom.name}</p>
          )}
        </div>
        <Button onClick={onBack}>Check in another child</Button>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Confirm Check-In</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-2xl font-display font-bold">
              {child.first_name} {child.last_name}
            </p>
            <p className="text-muted-foreground">
              {child.grade_group || "No grade"} · {child.families?.parent1_name} ({child.families?.parent1_phone})
            </p>
          </div>

          {assignedRoom && (
            <div className="rounded-lg bg-accent p-3">
              <p className="text-sm font-medium text-accent-foreground">
                Assigned Room: <span className="font-bold">{assignedRoom.name}</span>
              </p>
            </div>
          )}

          {child.allergies && (
            <Badge variant="destructive" className="gap-1 text-sm py-1 px-3">
              <AlertTriangle className="h-3.5 w-3.5" />
              Allergies: {child.allergies}
            </Badge>
          )}

          {!activeService && (
            <p className="text-sm text-warning">
              ⚠ No active service. Ask an admin to create one in Settings.
            </p>
          )}

          <Button
            className="w-full h-12 text-base"
            onClick={() => checkIn.mutate()}
            disabled={checkIn.isPending || !activeService}
          >
            <Printer className="h-5 w-5 mr-2" />
            {checkIn.isPending ? "Checking in..." : "Check In & Print Tag"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertTriangle, Printer } from "lucide-react";
import EditFamily from "./EditFamily";
import { printNameTag, getPrinterStatus } from "@/lib/brotherPrinter";
import { queueCheckIn, getRoomsOffline } from "@/lib/offlineSync";

interface CheckInConfirmProps {
  child: {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    grade_group: string | null;
    allergies: string | null;
    family_id: string;
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
  const isOnline = navigator.onLine;

  // Find matching room by grade_group
  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    enabled: isOnline,
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("*");
      return data || [];
    },
  });

  // Get (or auto-create) today's active service
  const { data: activeService } = useQuery({
    queryKey: ["active-service"],
    enabled: isOnline,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ensure_todays_service" as any);
      if (error) {
        console.error("ensure_todays_service failed", error);
        return null;
      }
      return data as any;
    },
  });

  // Auto-assign room based on grade
  const assignedRoom = rooms?.find(
    (r) => r.grade_group && child.grade_group && r.grade_group.toLowerCase() === child.grade_group.toLowerCase()
  );

  const checkIn = useMutation({
    mutationFn: async () => {
      const checkInData = {
        id: crypto.randomUUID(),
        child_id: child.id,
        service_id: activeService?.id || null,
        room_id: assignedRoom?.id || null,
        checked_in_by: user?.id || null,
        checked_in_at: new Date().toISOString(),
      };

      if (isOnline) {
        const { error } = await supabase.from("check_ins").insert({
          child_id: checkInData.child_id,
          service_id: checkInData.service_id as any,
          room_id: checkInData.room_id,
          checked_in_by: checkInData.checked_in_by,
        });
        if (error) throw error;
      } else {
        // Queue for later sync
        await queueCheckIn(checkInData);
      }

      // Try to print if printer connected
      const printerStatus = getPrinterStatus();
      if (printerStatus.connected) {
        try {
          let roomName = assignedRoom?.name || "TBD";
          if (!isOnline && !assignedRoom) {
            const offlineRooms = await getRoomsOffline();
            const match = offlineRooms.find(
              (r) => r.grade_group && child.grade_group && r.grade_group.toLowerCase() === child.grade_group.toLowerCase()
            );
            if (match) roomName = match.name;
          }

          await printNameTag({
            childName: `${child.first_name} ${child.last_name}`,
            roomName,
            allergies: child.allergies,
            parentName: child.families?.parent1_name,
          });
          toast.success("Label printed!");
        } catch (e: any) {
          toast.error(`Print failed: ${e.message}`);
        }
      }
    },
    onSuccess: () => {
      setSuccess(true);
      toast.success(`${child.first_name} checked in!${!isOnline ? " (offline — will sync later)" : ""}`);
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
          {!isOnline && (
            <Badge variant="outline" className="mt-2">Queued for sync</Badge>
          )}
        </div>
        <Button onClick={onBack}>Check in another child</Button>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to search
        </Button>
        <EditFamily familyId={child.family_id} />
      </div>

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

          {!isOnline && (
            <Badge variant="secondary" className="gap-1">
              Offline mode — check-in will sync when back online
            </Badge>
          )}

          <Button
            className="w-full h-12 text-base"
            onClick={() => checkIn.mutate()}
            disabled={checkIn.isPending}
          >
            <Printer className="h-5 w-5 mr-2" />
            {checkIn.isPending ? "Checking in..." : "Check In & Print Tag"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

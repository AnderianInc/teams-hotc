import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertTriangle, Printer, PrinterCheck, PrinterIcon } from "lucide-react";
import EditFamily from "./EditFamily";
import { printCheckInLabels, getPrinterStatus, verifyPrinterOnline, generateSecurityCode } from "@/lib/brotherPrinter";
import { queueCheckIn, getRoomsOffline } from "@/lib/offlineSync";
import LabelPreviewDialog from "./LabelPreviewDialog";

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
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [phase, setPhase] = useState<"idle" | "verifying" | "printing" | "saving">("idle");
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const securityCode = useMemo(() => generateSecurityCode(), [child.id]);
  const isOnline = navigator.onLine;
  const printerStatus = getPrinterStatus();

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

  // Check for existing open check-in for this child + service (prevents duplicates)
  const { data: existingCheckIn } = useQuery({
    queryKey: ["existing-check-in", child.id, activeService?.id],
    enabled: !!activeService?.id && isOnline,
    queryFn: async () => {
      const { data } = await supabase
        .from("check_ins")
        .select("id, checked_in_at")
        .eq("child_id", child.id)
        .eq("service_id", activeService!.id)
        .is("checked_out_at", null)
        .maybeSingle();
      return data;
    },
  });
  const alreadyCheckedIn = !!existingCheckIn;

  const serviceDateLabel = activeService?.service_date
    ? new Date(activeService.service_date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

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

      // STEP 0: Never double check-in the same child for the same service.
      if (isOnline && activeService?.id) {
        const { data: dup } = await supabase
          .from("check_ins")
          .select("id")
          .eq("child_id", child.id)
          .eq("service_id", activeService.id)
          .is("checked_out_at", null)
          .maybeSingle();
        if (dup) throw new Error(`${child.first_name} is already checked in for this service.`);
      }

      // STEP 1: Printer is mandatory. Verify it's actually reachable right now
      // (a stale connection object is not enough — the bridge PC may have slept,
      // the printer may be powered off, etc.).
      setPhase("verifying");
      await verifyPrinterOnline();

      // STEP 2: Print the label. If this throws, we do NOT save the check-in
      // so staff can fix the printer and retry.
      setPhase("printing");
      // Room label = child's grade / age group from directory (per admin spec).
      // Fall back to auto-assigned room only when the child has no grade set.
      let roomName = child.grade_group || assignedRoom?.name || "TBD";
      if (!isOnline && !child.grade_group && !assignedRoom) {
        const offlineRooms = await getRoomsOffline();
        const match = offlineRooms.find((r) => r.grade_group);
        if (match) roomName = match.name;
      }
      await printCheckInLabels({
        childName: `${child.first_name} ${child.last_name}`,
        roomName,
        allergies: child.allergies,
        parentName: child.families?.parent1_name,
        parentPhone: child.families?.parent1_phone,
        securityCode,
      });

      // STEP 3: Only after the printer confirms the send, record the check-in.
      setPhase("saving");
      if (isOnline) {
        const { error } = await supabase.from("check_ins").insert({
          child_id: checkInData.child_id,
          service_id: checkInData.service_id as any,
          room_id: checkInData.room_id,
          checked_in_by: checkInData.checked_in_by,
          security_code: securityCode,
        } as any);
        if (error) throw error;
      } else {
        await queueCheckIn({ ...checkInData, security_code: securityCode } as any);
      }
    },
    onSuccess: () => {
      setPhase("idle");
      setIssuedCode(securityCode);
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["check-ins-today"] });
      queryClient.invalidateQueries({ queryKey: ["todays-checkins"] });
      toast.success(`${child.first_name} checked in & 3 labels printed!${!isOnline ? " (offline — will sync later)" : ""}`);
    },
    onError: (e: Error) => {
      setPhase("idle");
      toast.error(`Check-in aborted: ${e.message}`);
    },
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
          <p className="text-sm text-muted-foreground mt-1">{serviceDateLabel}</p>
          {assignedRoom && (
            <p className="text-muted-foreground mt-1">Room: {assignedRoom.name}</p>
          )}
          {issuedCode && (
            <div className="mt-4 rounded-md border bg-muted p-3">
              <p className="text-xs uppercase text-muted-foreground">Pickup code (parent + child + teacher)</p>
              <p className="text-3xl font-mono font-bold tracking-widest">{issuedCode}</p>
            </div>
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
          <p className="text-sm text-muted-foreground">{serviceDateLabel}</p>
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

          {alreadyCheckedIn && (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-warning" />
              <span>
                Already checked in for this service at{" "}
                <b>{new Date(existingCheckIn!.checked_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b>.
              </span>
            </div>
          )}

          {/* Printer status — MUST be connected to check in */}
          <div
            className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
              printerStatus.connected
                ? "border-success/40 bg-success/5 text-success"
                : "border-destructive/40 bg-destructive/5 text-destructive"
            }`}
          >
            {printerStatus.connected ? (
              <>
                <PrinterCheck className="h-4 w-4 text-success" />
                <span>Printer ready: <b>{printerStatus.name}</b></span>
              </>
            ) : (
              <>
                <PrinterIcon className="h-4 w-4" />
                <span>No printer connected. Connect one (top of page) before checking in.</span>
              </>
            )}
          </div>

          <Button
            className="w-full h-12 text-base"
            onClick={() => checkIn.mutate()}
            disabled={checkIn.isPending || !printerStatus.connected || alreadyCheckedIn}
          >
            <Printer className="h-5 w-5 mr-2" />
            {alreadyCheckedIn
              ? "Already checked in"
              : phase === "verifying"
              ? "Checking printer…"
              : phase === "printing"
              ? "Printing label…"
              : phase === "saving"
              ? "Saving check-in…"
              : "Check In & Print Tag"}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}

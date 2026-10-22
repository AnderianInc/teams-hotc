import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Printer, PrinterCheck, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ageInYears } from "@/lib/kidsClasses";
import { useAirPrintLabels } from "@/hooks/useAirPrintLabels";
import { runKidsPrintFlow } from "@/lib/kidsPrintFlow";
import {
  getMirrorPrint,
  setMirrorPrint,
  getPrinterStatus,
  verifyPrinterOnline,
  printNameTag,
  renderLabelCanvas,
} from "@/lib/brotherPrinter";

export interface YoungAdultStudent {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  families?: { parent1_name?: string | null; parent1_phone?: string | null } | null;
}

interface Props {
  student: YoungAdultStudent | null;
  date: string; // yyyy-MM-dd
  alreadyPresent: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Check-in + single name-tag print dialog for Young Adults (15–19). */
export default function YoungAdultCheckInDialog({ student, date, alreadyPresent, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mirror, setMirror] = useState<boolean>(getMirrorPrint());
  const [done, setDone] = useState(false);
  const [awaitingPrintConfirmation, setAwaitingPrintConfirmation] = useState(false);
  const printerStatus = getPrinterStatus();
  const isAirPrint = printerStatus.type === "airprint";

  const name = student ? `${student.first_name} ${student.last_name}`.trim() : "";
  const age = student ? ageInYears(student.date_of_birth) : null;
  const tag = {
    copy: "child" as const,
    childName: name,
    roomName: "Young Adults",
    securityCode: "",
    parentName: student?.families?.parent1_name ?? null,
    date: format(new Date(date + "T00:00:00"), "EEE, MMM d yyyy"),
  };
  const airPrint = useAirPrintLabels(open && !!student && !done && !awaitingPrintConfirmation, [tag]);

  const previewUrl = useMemo(() => {
    if (!open || !student) return "";
    return renderLabelCanvas(
      {
        copy: "child",
        childName: name,
        roomName: "Young Adults",
        securityCode: "",
        parentName: student.families?.parent1_name ?? null,
        date: format(new Date(date + "T00:00:00"), "EEE, MMM d yyyy"),
      },
      isAirPrint ? { mirror: false, upright: true } : { mirror },
    ).toDataURL("image/png");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student?.id, mirror, isAirPrint, date]);

  const checkIn = useMutation({
    mutationFn: async (confirmed: boolean) => {
      if (!student) throw new Error("Select a student first.");
      if (confirmed && !awaitingPrintConfirmation) throw new Error("Print the tag before confirming.");
      return runKidsPrintFlow(confirmed, async () => {
        if (!getPrinterStatus().connected) throw new Error("Connect a printer first.");
        await verifyPrinterOnline();
        await printNameTag(tag);
      }, async () => {
        if (!alreadyPresent) {
          const { error } = await supabase
            .from("young_adult_attendance")
            .insert({ child_id: student.id, service_date: date, marked_by: user?.id ?? null });
          if (error) throw error;
        }
      });
    },
    onSuccess: (result) => {
      if (result === "awaiting-confirmation") {
        setAwaitingPrintConfirmation(true);
        return;
      }
      setAwaitingPrintConfirmation(false);
      setDone(true);
      qc.invalidateQueries({ queryKey: ["young-adult-attendance", date] });
      toast.success(alreadyPresent ? `Name tag reprinted for ${student?.first_name}.` : `${student?.first_name} checked in & tag printed!`);
    },
    onError: (e: Error) => toast.error(`Check-in aborted: ${e.message}`),
  });

  const close = (v: boolean) => {
    if (checkIn.isPending) return;
    if (!v) { setDone(false); setAwaitingPrintConfirmation(false); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-w-md flex-col gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-10 text-left">
          <DialogTitle>{done ? "Checked in" : "Young Adults check-in"}</DialogTitle>
        </DialogHeader>

        {student && done ? (
          <div className="min-h-0 overflow-y-auto overscroll-contain flex flex-col items-center gap-3 px-4 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="break-words text-lg font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">
              {alreadyPresent ? "Tag reprinted." : "Checked in and tag printed."}
            </p>
            <Button onClick={() => close(false)} className="mt-2">Done</Button>
          </div>
        ) : student && awaitingPrintConfirmation ? (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
              <p className="break-words text-lg font-semibold">{name}</p>
              <p>Has the name tag finished printing?</p>
              <p className="text-sm text-muted-foreground">{alreadyPresent ? "Attendance is unchanged." : "Not checked in yet."}</p>
            </div>
            <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:space-x-0">
              <Button variant="outline" className="min-h-10 whitespace-normal" disabled={checkIn.isPending} onClick={() => setAwaitingPrintConfirmation(false)}>Canceled / Not printed</Button>
              <Button className="min-h-10 whitespace-normal" disabled={checkIn.isPending} onClick={() => checkIn.mutate(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />{checkIn.isPending ? "Saving…" : alreadyPresent ? "Tag printed — Done" : "Tag printed — Check in"}
              </Button>
            </DialogFooter>
          </>
        ) : student ? (
          <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
            <div>
              <p className="break-words text-lg font-display font-bold">{name}</p>
              <p className="break-words text-sm text-muted-foreground">
                {age === null ? "Age unknown" : `Age ${age}`}
                {student.families?.parent1_name ? ` · ${student.families.parent1_name}` : ""}
                {student.families?.parent1_phone ? ` (${student.families.parent1_phone})` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
              </p>
            </div>

            {alreadyPresent && (
              <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-sm">
                Already marked present for this date — printing again won't change attendance.
              </p>
            )}

            <div
              className={`flex items-center gap-2 rounded-md border p-2 text-sm [&_svg]:shrink-0 [&_span]:min-w-0 [&_span]:break-words ${
                printerStatus.connected
                  ? "border-success/40 bg-success/5 text-success"
                  : "border-destructive/40 bg-destructive/5 text-destructive"
              }`}
            >
              {printerStatus.connected ? (
                <>
                  <PrinterCheck className="h-4 w-4 text-success" />
                  <span>{isAirPrint ? "Print dialog selected" : "Printer ready"}: <b>{printerStatus.name}</b></span>
                </>
              ) : (
                <>
                  <PrinterIcon className="h-4 w-4" />
                  <span>No printer connected. Connect one on the Check-In page first.</span>
                </>
              )}
            </div>

            {!isAirPrint && (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <Label htmlFor="ya-mirror" className="font-medium">Mirror horizontally</Label>
                  <p className="text-xs text-muted-foreground">Toggle if labels come out reversed.</p>
                </div>
                <Switch id="ya-mirror" checked={mirror} onCheckedChange={(v) => { setMirror(v); setMirrorPrint(v); }} />
              </div>
            )}

            {previewUrl && (
              <div className="rounded-md border bg-muted p-2">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tag preview</p>
                <img src={previewUrl} alt="Name tag preview" className="mx-auto max-h-48 w-full object-contain bg-background" />
              </div>
            )}
            {airPrint.error && <p role="alert" className="text-sm text-destructive">{airPrint.error}</p>}

          </div>
            <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:space-x-0">
              <Button variant="outline" className="min-h-10" onClick={() => close(false)} disabled={checkIn.isPending}>Cancel</Button>
              <Button className="min-h-10 whitespace-normal" onClick={() => {
                if (!isAirPrint) { checkIn.mutate(false); return; }
                try {
                  airPrint.print();
                  setAwaitingPrintConfirmation(true);
                } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open printing."); }
              }} disabled={checkIn.isPending || !printerStatus.connected || (isAirPrint && !airPrint.ready)}>
                <Printer className="h-4 w-4 mr-2" />
                {checkIn.isPending ? "Printing…" : alreadyPresent ? "Print tag again" : "Print name tag"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getPrinterStatus, printCheckInLabels, verifyPrinterOnline, type NameTagOptions } from "@/lib/brotherPrinter";
import { reprintKidsLabels } from "@/lib/kidsPrintFlow";
import LabelPreviewDialog from "./LabelPreviewDialog";

export default function ReprintLabels({ base }: { base: Omit<NameTagOptions, "copy"> }) {
  const [open, setOpen] = useState(false);
  const reprint = useMutation({
    mutationFn: () => reprintKidsLabels(base, verifyPrinterOnline, printCheckInLabels),
    onSuccess: () => {
      setOpen(false);
      toast.info("Reprint requested. Attendance and pickup code are unchanged.");
    },
    onError: (error: Error) => toast.error(`Reprint failed: ${error.message}. You can retry.`),
  });
  const missingCode = !base.securityCode.trim();
  return <>
    <Button variant="outline" size="sm" disabled={reprint.isPending || missingCode}
      title={missingCode ? "No saved pickup code for this check-in" : `Reprint labels for ${base.childName}`}
      aria-label={`Reprint labels for ${base.childName}`}
      onClick={() => {
        if (!getPrinterStatus().connected) { toast.error("Connect a printer at the top of Check-In before reprinting."); return; }
        setOpen(true);
      }}>
      <Printer className="h-4 w-4 mr-1" /> Reprint
    </Button>
    <LabelPreviewDialog open={open} onOpenChange={(value) => !reprint.isPending && setOpen(value)}
      base={base} printing={reprint.isPending} onConfirm={() => reprint.mutate()} />
  </>;
}
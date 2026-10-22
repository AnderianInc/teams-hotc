import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { useAirPrintLabels } from "@/hooks/useAirPrintLabels";
import {
  renderLabelPreviewDataUrl,
  getMirrorPrint,
  setMirrorPrint,
  type NameTagOptions,
  type LabelCopy,
  getPrinterStatus,
  renderLabelCanvas,
} from "@/lib/brotherPrinter";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  base: Omit<NameTagOptions, "copy">;
  onConfirm: (airPrintRequested?: boolean) => void;
  printing?: boolean;
}

const COPIES: LabelCopy[] = ["child", "parent", "teacher"];

export default function LabelPreviewDialog({ open, onOpenChange, base, onConfirm, printing }: Props) {
  const [mirror, setMirror] = useState<boolean>(getMirrorPrint());
  const isAirPrint = getPrinterStatus().type === "airprint";
  const airPrint = useAirPrintLabels(open, COPIES.map((copy) => ({ ...base, copy })));
  // Re-render previews whenever mirror or open toggles (bitmap depends on mirror).
  const previews = useMemo(() => {
    if (!open) return [];
    return COPIES.map((copy) => ({
      copy,
      url: isAirPrint ? renderLabelCanvas({ ...base, copy }, { mirror: false, upright: true }).toDataURL("image/png") : renderLabelPreviewDataUrl({ ...base, copy }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mirror, isAirPrint, base.childName, base.roomName, base.securityCode, base.allergies, base.parentName, base.parentPhone, base.date]);

  const toggleMirror = (v: boolean) => {
    setMirror(v);
    setMirrorPrint(v);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-3xl flex-col gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-10">
          <DialogTitle>Label preview</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
        {isAirPrint && <p className="text-sm text-muted-foreground">Paper: 62 mm continuous roll, 62 × 104 mm page. Margins: none. Scale: 100%. Not 12 × 12 mm.</p>}
        {airPrint.error && <p role="alert" className="text-sm text-destructive">{airPrint.error}</p>}
        {!isAirPrint && <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="mirror" className="font-medium">Mirror horizontally</Label>
            <p className="text-xs text-muted-foreground">
              Toggle if labels come out reversed on the printer.
            </p>
          </div>
          <Switch id="mirror" checked={mirror} onCheckedChange={toggleMirror} />
        </div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {previews.map((p) => (
            <div key={p.copy} className="border rounded-md p-2 bg-muted">
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                {p.copy}
              </p>
              <img
                src={p.url}
                alt={`${p.copy} label preview`}
                className="mx-auto max-h-64 w-full object-contain bg-background"
              />
            </div>
          ))}
        </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={printing}>
            Cancel
          </Button>
          <Button onClick={() => {
            try {
              if (isAirPrint) airPrint.print();
              onConfirm(isAirPrint);
            } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open printing."); }
          }} disabled={printing || (isAirPrint && !airPrint.ready)}>
            <Printer className="h-4 w-4 mr-2" />
            {printing ? "Printing…" : "Print 3 labels"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

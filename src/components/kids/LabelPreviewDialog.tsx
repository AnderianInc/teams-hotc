import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";
import {
  renderLabelPreviewDataUrl,
  getMirrorPrint,
  setMirrorPrint,
  type NameTagOptions,
  type LabelCopy,
} from "@/lib/brotherPrinter";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  base: Omit<NameTagOptions, "copy">;
  onConfirm: () => void;
  printing?: boolean;
}

const COPIES: LabelCopy[] = ["child", "parent", "teacher"];

export default function LabelPreviewDialog({ open, onOpenChange, base, onConfirm, printing }: Props) {
  const [mirror, setMirror] = useState<boolean>(getMirrorPrint());
  // Re-render previews whenever mirror or open toggles (bitmap depends on mirror).
  const previews = useMemo(() => {
    if (!open) return [];
    return COPIES.map((copy) => ({
      copy,
      url: renderLabelPreviewDataUrl({ ...base, copy }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mirror, base.childName, base.roomName, base.securityCode, base.allergies, base.parentName, base.parentPhone]);

  const toggleMirror = (v: boolean) => {
    setMirror(v);
    setMirrorPrint(v);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Label preview — exactly what will print</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="mirror" className="font-medium">Mirror horizontally</Label>
            <p className="text-xs text-muted-foreground">
              Toggle if labels come out reversed on the printer.
            </p>
          </div>
          <Switch id="mirror" checked={mirror} onCheckedChange={toggleMirror} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[60vh] overflow-auto">
          {previews.map((p) => (
            <div key={p.copy} className="border rounded-md p-2 bg-muted">
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                {p.copy}
              </p>
              <img
                src={p.url}
                alt={`${p.copy} label preview`}
                className="w-full h-auto bg-white"
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={printing}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={printing}>
            <Printer className="h-4 w-4 mr-2" />
            {printing ? "Printing…" : "Print 3 labels"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

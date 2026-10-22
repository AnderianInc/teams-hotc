import { useLayoutEffect, useRef, useState } from "react";
import { getPrinterStatus, renderLabelCanvas, type NameTagOptions } from "@/lib/brotherPrinter";
import { prepareBrowserLabelPrint } from "@/lib/browserLabelPrint";

export function useAirPrintLabels(open: boolean, labels: NameTagOptions[]) {
  const job = useRef<ReturnType<typeof prepareBrowserLabelPrint> | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAirPrint = getPrinterStatus().type === "airprint";
  const labelKey = JSON.stringify(labels);
  useLayoutEffect(() => {
    setReady(false);
    setError(null);
    if (!open || !isAirPrint) return;
    try {
      const options: NameTagOptions[] = JSON.parse(labelKey);
      const prepared = prepareBrowserLabelPrint(options.map((label) =>
        renderLabelCanvas(label, { mirror: false, upright: true })));
      job.current = prepared;
      setReady(true);
      return () => { prepared.dispose(); job.current = null; };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare labels.");
    }
  }, [open, isAirPrint, labelKey]);
  return { ready, error, print: () => {
    if (!job.current) throw new Error("Labels are not ready. Reopen the preview and try again.");
    job.current.print();
  } };
}
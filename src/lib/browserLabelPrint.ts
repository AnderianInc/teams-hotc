/** Prepare before the tap; printing itself must stay synchronous for iPad Safari. */
export function prepareBrowserLabelPrint(labels: HTMLCanvasElement[]) {
  if (!labels.length) throw new Error("No labels to print.");
  document.getElementById("hotc-airprint-root")?.remove();
  document.getElementById("hotc-airprint-style")?.remove();
  const style = document.createElement("style");
  style.id = "hotc-airprint-style";
  style.textContent = `
    #hotc-airprint-root { display: none; }
    @media print {
      @page { size: 104mm 62mm; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; width: 104mm !important; min-width: 0 !important; min-height: 0 !important; height: auto !important; overflow: visible !important; position: static !important; transform: none !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body > *:not(#hotc-airprint-root) { display: none !important; }
      #hotc-airprint-root { display: block !important; position: static !important; width: 104mm !important; margin: 0 !important; padding: 0 !important; }
      #hotc-airprint-root .lbl { box-sizing: border-box; width: 104mm; height: 61mm; margin: 0; padding: 0; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      #hotc-airprint-root .lbl + .lbl { break-before: page; page-break-before: always; }
      #hotc-airprint-root canvas { display: block; width: 104mm; height: 61mm; margin: 0; padding: 0; max-width: none; }
    }`;
  const root = document.createElement("div");
  root.id = "hotc-airprint-root";
  root.setAttribute("aria-hidden", "true");
  for (const canvas of labels) {
    const page = document.createElement("div");
    page.className = "lbl";
    page.appendChild(canvas);
    root.appendChild(page);
  }
  document.head.appendChild(style);
  document.body.appendChild(root);
  let requested = false;
  const cleanup = () => {
    root.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  return {
    print() {
      if (!root.isConnected) throw new Error("Reopen the preview before printing again.");
      requested = true;
      window.addEventListener("afterprint", cleanup);
      try {
        // No promise, timer, network request or dialog closing before this call.
        window.print();
      } catch (error) {
        cleanup();
        throw error;
      }
    },
    dispose() {
      // Safari can return while its print sheet still needs this document.
      // Retain requested pages until afterprint or the next prepared job.
      if (!requested) cleanup();
    },
  };
}
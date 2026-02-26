import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Download } from "lucide-react";

const CHECK_IN_URL = "https://teams-hotc.lovable.app/check-in";

export default function AttendanceQRDialog() {
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const svg = document.getElementById("attendance-qr")?.innerHTML || "";
    printWindow.document.write(`
      <html><head><title>Church Check-In QR</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;}
      h2{margin-bottom:8px;}p{color:#666;margin-bottom:24px;}</style></head>
      <body><h2>Church Check-In</h2><p>Scan to check in for today's service</p>${svg}
      <p style="margin-top:24px;font-size:12px;color:#999;">${CHECK_IN_URL}</p>
      <script>setTimeout(()=>window.print(),300)</script></body></html>
    `);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <QrCode className="h-4 w-4 mr-1" /> QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check-In QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div id="attendance-qr" className="p-4 bg-white rounded-xl border">
            <QRCodeSVG value={CHECK_IN_URL} size={200} level="H" />
          </div>
          <p className="text-sm text-muted-foreground text-center break-all max-w-xs">{CHECK_IN_URL}</p>
          <Button variant="outline" onClick={handlePrint}>
            <Download className="h-4 w-4 mr-2" /> Print QR Code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

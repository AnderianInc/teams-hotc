import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, Download } from "lucide-react";

export default function QRCodeDisplay() {
  const welcomeUrl = "https://teams.hotc.life/welcome";

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const svg = document.getElementById("welcome-qr")?.innerHTML || "";
    printWindow.document.write(`
      <html><head><title>HOTC Welcome QR</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;}
      h2{margin-bottom:8px;}p{color:#666;margin-bottom:24px;}</style></head>
      <body><h2>House of Transformation Church</h2><p>Scan to register as a visitor</p>${svg}
      <p style="margin-top:24px;font-size:12px;color:#999;">${welcomeUrl}</p>
      <script>setTimeout(()=>window.print(),300)</script></body></html>
    `);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Visitor QR Code
        </CardTitle>
        <CardDescription>
          Print this QR code for welcome desks, bulletins, and signage. First-time visitors scan it to register.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <div id="welcome-qr" className="p-4 bg-white rounded-xl border">
          <QRCodeSVG value={welcomeUrl} size={200} level="H" />
        </div>
        <p className="text-sm text-muted-foreground text-center break-all max-w-xs">{welcomeUrl}</p>
        <Button variant="outline" onClick={handlePrint}>
          <Download className="h-4 w-4 mr-2" /> Print QR Code
        </Button>
      </CardContent>
    </Card>
  );
}

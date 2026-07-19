import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  connectUSB,
  connectBluetooth,
  connectBridge,
  disconnectPrinter,
  discoverBridge,
  getPrinterStatus,
  getSavedBridgeUrl,
  getTwoColorMode,
  setTwoColorMode,
  isUSBAvailable,
  isBluetoothAvailable,
  normalizeBridgeUrl,
  printTestLabel,
  tryAutoConnectBridge,
  type PrinterStatus,
} from "@/lib/brotherPrinter";
import { toast } from "sonner";
import { Printer, Bluetooth, Usb, Unplug, Wifi, Settings2, Radar } from "lucide-react";

export default function PrinterConnect() {
  const [status, setStatus] = useState<PrinterStatus>(getPrinterStatus());
  const [bridgeUrl, setBridgeUrl] = useState(getSavedBridgeUrl());
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);

  // On mount: try saved bridge, then auto-discover via mDNS `.local` names.
  useEffect(() => {
    if (!status.connected) {
      tryAutoConnectBridge().then((s) => {
        if (s) {
          setStatus(s);
          setBridgeUrl(getSavedBridgeUrl());
          toast.success(`Auto-connected to ${s.name}`);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUSB = async () => {
    try {
      const s = await connectUSB();
      setStatus(s);
      toast.success(`Connected to ${s.name} via USB`);
    } catch (e: any) {
      if (e.name !== "NotFoundError") toast.error(e.message);
    }
  };

  const handleBluetooth = async () => {
    try {
      const s = await connectBluetooth();
      setStatus(s);
      toast.success(`Connected to ${s.name} via Bluetooth`);
    } catch (e: any) {
      if (e.name !== "NotFoundError") toast.error(e.message);
    }
  };

  const handleBridge = async () => {
    if (!bridgeUrl.trim()) { toast.error("Enter the bridge URL"); return; }
    try {
      const normalized = normalizeBridgeUrl(bridgeUrl);
      const s = await connectBridge(normalized);
      setStatus(s);
      setBridgeUrl(normalized);
      toast.success(`Connected to ${s.name}`);
    } catch (e: any) {
      toast.error(e.message || "Could not reach bridge");
    }
  };

  const openBridgeStatus = () => {
    const normalized = normalizeBridgeUrl(bridgeUrl || "https://hotc-print-bridge.local:9443");
    window.open(`${normalized}/status`, "_blank", "noopener,noreferrer");
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const found = await discoverBridge(bridgeUrl.trim() ? [bridgeUrl.trim()] : []);
      if (!found) {
        toast.error(
          "No bridge found. If the bridge is on THIS computer, try http://localhost:9999. If it's on another PC, open its HTTPS URL in a new tab and fully trust the certificate first (browser 'Advanced → Proceed' is not enough for fetch — install cert.pem as a trusted root, or use the LAN IP with http:// on the same machine).",
          { duration: 12000 }
        );
        return;
      }
      setBridgeUrl(found);
      const s = await connectBridge(found);
      setStatus(s);
      toast.success(`Found bridge at ${found}`);
    } catch (e: any) {
      toast.error(e.message || "Discovery failed");
    } finally { setScanning(false); }
  };


  const handleTest = async () => {
    setTesting(true);
    try {
      await printTestLabel();
      toast.success("Test label sent");
    } catch (e: any) {
      toast.error(e.message || "Test print failed");
    } finally { setTesting(false); }
  };

  const handleDisconnect = async () => {
    await disconnectPrinter();
    setStatus(getPrinterStatus());
    toast.info("Printer disconnected");
  };

  if (status.connected) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="default" className="gap-1">
          <Printer className="h-3 w-3" />
          {status.name} ({status.type?.toUpperCase()})
        </Badge>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleTest} disabled={testing}>
          {testing ? "…" : "Test"}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDisconnect}>
          <Unplug className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isUSBAvailable() && (
        <Button variant="outline" size="sm" onClick={handleUSB} className="gap-1">
          <Usb className="h-3.5 w-3.5" /> USB
        </Button>
      )}
      {isBluetoothAvailable() && (
        <Button variant="outline" size="sm" onClick={handleBluetooth} className="gap-1">
          <Bluetooth className="h-3.5 w-3.5" /> Bluetooth
        </Button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Wifi className="h-3.5 w-3.5" /> Network bridge
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="end">
          <div className="space-y-1">
            <p className="text-sm font-medium">Print bridge</p>
            <p className="text-xs text-muted-foreground">
              Tap <b>Auto-find</b> to detect a bridge on this wifi, or paste its URL manually.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={handleScan} disabled={scanning} className="w-full gap-1">
            <Radar className={`h-3.5 w-3.5 ${scanning ? "animate-pulse" : ""}`} />
            {scanning ? "Scanning wifi…" : "Auto-find bridge"}
          </Button>
          <Input
            value={bridgeUrl}
            onChange={(e) => setBridgeUrl(e.target.value)}
            placeholder="http://localhost:9999  (same PC)  or  https://192.168.x.x:9443"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleBridge} className="flex-1">
              <Wifi className="h-3.5 w-3.5 mr-1" /> Connect
            </Button>
            <Button size="sm" variant="outline" onClick={openBridgeStatus}>
              Open status
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <b>Same PC as the bridge?</b> Use <code>http://localhost:9999</code> — no cert warning, works instantly.
          </p>
          <div className="rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Connecting from a different device (iPad, phone, other PC)?</p>
            <p>The bridge uses a self-signed HTTPS certificate. Browsers will NOT let this app <code>fetch()</code> it just because you clicked "Advanced → Proceed" in a tab — you must fully trust it:</p>
            <p>• <b>iPad/iPhone:</b> AirDrop <code>print-bridge/cert/cert.pem</code> → open → Settings → General → VPN &amp; Device Management → install profile → Settings → General → About → Certificate Trust Settings → enable full trust.</p>
            <p>• <b>Android:</b> Settings → Security → Install certificate → CA certificate → pick <code>cert.pem</code>.</p>
            <p>• <b>Windows:</b> double-click <code>cert.pem</code> → Install Certificate → Local Machine → "Trusted Root Certification Authorities". Also install <a href="https://support.apple.com/kb/DL999" target="_blank" rel="noreferrer" className="underline">Bonjour Print Services</a> so <code>.local</code> resolves.</p>
            <p>• <b>Mac:</b> double-click <code>cert.pem</code> → Keychain Access → set to "Always Trust".</p>
            <p>Also check: firewall allows inbound TCP 9443 (Private profile), and the wifi doesn't have "client isolation" enabled.</p>
          </div>

        </PopoverContent>
      </Popover>
      {!isUSBAvailable() && !isBluetoothAvailable() && (
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Settings2 className="h-3 w-3" /> Mobile: use Network bridge
        </span>
      )}
    </div>
  );
}

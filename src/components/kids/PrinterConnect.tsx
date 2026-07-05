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
  isUSBAvailable,
  isBluetoothAvailable,
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
      const s = await connectBridge(bridgeUrl.trim());
      setStatus(s);
      toast.success(`Connected to ${s.name}`);
    } catch (e: any) {
      toast.error(e.message || "Could not reach bridge");
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const found = await discoverBridge(bridgeUrl.trim() ? [bridgeUrl.trim()] : []);
      if (!found) { toast.error("No bridge found on this network"); return; }
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
            placeholder="https://hotc-print-bridge.local:9443"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleBridge} className="flex-1">
              <Wifi className="h-3.5 w-3.5 mr-1" /> Connect
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            First time on this device, visit the URL directly in the browser and accept the certificate warning.
          </p>

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

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  connectUSB,
  connectBluetooth,
  disconnectPrinter,
  getPrinterStatus,
  isUSBAvailable,
  isBluetoothAvailable,
  type PrinterStatus,
} from "@/lib/brotherPrinter";
import { toast } from "sonner";
import { Printer, Bluetooth, Usb, Unplug } from "lucide-react";

export default function PrinterConnect() {
  const [status, setStatus] = useState<PrinterStatus>(getPrinterStatus());

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
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDisconnect}>
          <Unplug className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isUSBAvailable() && (
        <Button variant="outline" size="sm" onClick={handleUSB} className="gap-1">
          <Usb className="h-3.5 w-3.5" />
          USB
        </Button>
      )}
      {isBluetoothAvailable() && (
        <Button variant="outline" size="sm" onClick={handleBluetooth} className="gap-1">
          <Bluetooth className="h-3.5 w-3.5" />
          Bluetooth
        </Button>
      )}
      {!isUSBAvailable() && !isBluetoothAvailable() && (
        <span className="text-xs text-muted-foreground">No printer APIs available</span>
      )}
    </div>
  );
}

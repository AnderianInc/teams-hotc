/**
 * Brother QL-800 series label printer integration
 * Supports Web USB and Web Bluetooth connections
 */

// Brother QL-800 USB vendor/product IDs
const BROTHER_VENDOR_ID = 0x04f9;
const QL800_PRODUCT_IDS = [0x209b, 0x209c, 0x209d]; // QL-800, QL-810W, QL-820NWB

// Brother BLE service UUID
const BROTHER_BLE_SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const BROTHER_BLE_WRITE_CHAR = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

export type PrinterConnectionType = "usb" | "bluetooth";

export interface PrinterStatus {
  connected: boolean;
  type: PrinterConnectionType | null;
  name: string | null;
}

interface PrinterConnection {
  type: PrinterConnectionType;
  name: string;
  send: (data: Uint8Array) => Promise<void>;
  disconnect: () => Promise<void>;
}

let currentConnection: PrinterConnection | null = null;

/** Check if Web USB is available */
export function isUSBAvailable(): boolean {
  return "usb" in navigator;
}

/** Check if Web Bluetooth is available */
export function isBluetoothAvailable(): boolean {
  return "bluetooth" in navigator;
}

/** Get current printer status */
export function getPrinterStatus(): PrinterStatus {
  if (!currentConnection) {
    return { connected: false, type: null, name: null };
  }
  return { connected: true, type: currentConnection.type, name: currentConnection.name };
}

/** Connect to Brother printer via USB */
export async function connectUSB(): Promise<PrinterStatus> {
  if (!isUSBAvailable()) throw new Error("Web USB not supported in this browser");

  const device = await (navigator as any).usb.requestDevice({
    filters: QL800_PRODUCT_IDS.map((pid) => ({ vendorId: BROTHER_VENDOR_ID, productId: pid })),
  });

  await device.open();
  await device.selectConfiguration(1);
  await device.claimInterface(0);

  // Find the OUT endpoint
  const iface = device.configuration!.interfaces[0];
  const alt = iface.alternates[0];
  const outEndpoint = alt.endpoints.find((e: any) => e.direction === "out");
  if (!outEndpoint) throw new Error("No output endpoint found");

  currentConnection = {
    type: "usb",
    name: device.productName || "Brother QL-800",
    send: async (data: Uint8Array) => {
      await device.transferOut(outEndpoint.endpointNumber, data);
    },
    disconnect: async () => {
      await device.close();
      currentConnection = null;
    },
  };

  return getPrinterStatus();
}

/** Connect to Brother printer via Bluetooth */
export async function connectBluetooth(): Promise<PrinterStatus> {
  if (!isBluetoothAvailable()) throw new Error("Web Bluetooth not supported in this browser");

  const device = await (navigator as any).bluetooth.requestDevice({
    filters: [{ namePrefix: "Brother" }],
    optionalServices: [BROTHER_BLE_SERVICE],
  });

  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(BROTHER_BLE_SERVICE);
  const writeChar = await service.getCharacteristic(BROTHER_BLE_WRITE_CHAR);

  currentConnection = {
    type: "bluetooth",
    name: device.name || "Brother QL-800 (BT)",
    send: async (data: Uint8Array) => {
      // BLE has a max packet size, chunk at 512 bytes
      const CHUNK = 512;
      for (let i = 0; i < data.length; i += CHUNK) {
        await writeChar.writeValueWithoutResponse(data.slice(i, i + CHUNK));
      }
    },
    disconnect: async () => {
      device.gatt?.disconnect();
      currentConnection = null;
    },
  };

  return getPrinterStatus();
}

/** Disconnect current printer */
export async function disconnectPrinter(): Promise<void> {
  if (currentConnection) {
    await currentConnection.disconnect();
    currentConnection = null;
  }
}

/**
 * Build Brother raster command for a simple name tag label.
 * QL-800 uses 62mm continuous tape (720 dots wide).
 * This creates a minimal raster image with text rendered as bitmap.
 */
export async function printNameTag(opts: {
  childName: string;
  roomName: string;
  allergies?: string | null;
  parentName?: string;
  date?: string;
}): Promise<void> {
  if (!currentConnection) throw new Error("No printer connected");

  const canvas = document.createElement("canvas");
  const WIDTH = 720; // QL-800 62mm tape width in dots
  const HEIGHT = 450; // ~40mm tall label
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header bar
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, WIDTH, 80);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("KIDS CHECK-IN", 20, 55);

  // Child name
  ctx.fillStyle = "#000000";
  ctx.font = "bold 60px sans-serif";
  ctx.fillText(opts.childName, 20, 170);

  // Room
  ctx.font = "36px sans-serif";
  ctx.fillText(`Room: ${opts.roomName}`, 20, 230);

  // Parent
  if (opts.parentName) {
    ctx.font = "28px sans-serif";
    ctx.fillStyle = "#555555";
    ctx.fillText(`Parent: ${opts.parentName}`, 20, 290);
  }

  // Date
  ctx.font = "24px sans-serif";
  ctx.fillStyle = "#888888";
  ctx.fillText(opts.date || new Date().toLocaleDateString(), 20, 340);

  // Allergy warning
  if (opts.allergies) {
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(0, 370, WIDTH, 80);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(`⚠ ALLERGY: ${opts.allergies}`, 20, 420);
  }

  // Convert canvas to raster data for Brother printer
  const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const rasterData = buildBrotherRaster(imageData, WIDTH, HEIGHT);

  await currentConnection.send(rasterData);
}

/** Convert ImageData to Brother QL raster format */
function buildBrotherRaster(imageData: ImageData, width: number, height: number): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const commands: number[] = [];

  // Initialize
  commands.push(...Array(200).fill(0x00)); // Invalidate
  commands.push(0x1b, 0x40); // Initialize command

  // Switch to raster mode
  commands.push(0x1b, 0x69, 0x61, 0x01);

  // Media/quality info
  commands.push(0x1b, 0x69, 0x7a); // Print info
  commands.push(0x86, 0x0a, 0x3e, 0x00); // QL-800, 62mm
  commands.push(height & 0xff, (height >> 8) & 0xff, (height >> 16) & 0xff, (height >> 24) & 0xff); // Label height
  commands.push(0x00, 0x00, 0x00, 0x00); // Starting page

  // Auto-cut, no mirror
  commands.push(0x1b, 0x69, 0x4d, 0x40); // Auto cut
  commands.push(0x1b, 0x69, 0x4b, 0x08); // Cut at end

  // Margins
  commands.push(0x1b, 0x69, 0x64, 0x23, 0x00); // Margin = 35 dots

  // Raster data
  for (let y = 0; y < height; y++) {
    commands.push(0x67, 0x00, bytesPerRow); // Raster line header
    for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteIdx * 8 + bit;
        if (x < width) {
          const pixelIdx = (y * width + x) * 4;
          const r = imageData.data[pixelIdx];
          const g = imageData.data[pixelIdx + 1];
          const b = imageData.data[pixelIdx + 2];
          // Convert to 1-bit: black if dark enough
          if ((r + g + b) / 3 < 128) {
            byte |= 1 << (7 - bit);
          }
        }
      }
      commands.push(byte);
    }
  }

  // Print and feed
  commands.push(0x1a); // Print command

  return new Uint8Array(commands);
}

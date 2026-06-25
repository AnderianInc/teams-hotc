/**
 * Brother QL-800 / QL-1110NWB label printer integration.
 *
 * Three transports are supported:
 *   - "usb"       Web USB (Chrome/Edge on Mac/PC kiosks)
 *   - "bluetooth" Web Bluetooth (Chrome/Edge desktop, Android)
 *   - "bridge"    HTTPS POST to a LAN print bridge (iPad/Android/phones).
 *                 See /print-bridge in this repo.
 *
 * Raster generation is identical across transports — only the byte
 * transport differs.
 */

const BROTHER_VENDOR_ID = 0x04f9;
const QL_PRODUCT_IDS = [
  0x209b, 0x209c, 0x209d, // QL-800 / 810W / 820NWB
  0x20a7, 0x20a8, 0x20a9, // QL-1100 / 1110NWB family
];
const BROTHER_BLE_SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const BROTHER_BLE_WRITE_CHAR = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

const BRIDGE_URL_KEY = "hotc.printBridgeUrl";

export type PrinterConnectionType = "usb" | "bluetooth" | "bridge";

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

export function isUSBAvailable(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}
export function isBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}
/** Network bridge works in every browser — only requires fetch. */
export function isBridgeAvailable(): boolean {
  return typeof fetch !== "undefined";
}

export function getPrinterStatus(): PrinterStatus {
  if (!currentConnection) return { connected: false, type: null, name: null };
  return { connected: true, type: currentConnection.type, name: currentConnection.name };
}

export function getSavedBridgeUrl(): string {
  try { return localStorage.getItem(BRIDGE_URL_KEY) || ""; } catch { return ""; }
}
export function saveBridgeUrl(url: string) {
  try { localStorage.setItem(BRIDGE_URL_KEY, url); } catch { /* ignore */ }
}

// ---------------- USB ----------------
export async function connectUSB(): Promise<PrinterStatus> {
  if (!isUSBAvailable()) throw new Error("Web USB not supported in this browser");
  const device = await (navigator as any).usb.requestDevice({
    filters: QL_PRODUCT_IDS.map((pid) => ({ vendorId: BROTHER_VENDOR_ID, productId: pid })),
  });
  await device.open();
  await device.selectConfiguration(1);
  await device.claimInterface(0);
  const iface = device.configuration!.interfaces[0];
  const alt = iface.alternates[0];
  const outEndpoint = alt.endpoints.find((e: any) => e.direction === "out");
  if (!outEndpoint) throw new Error("No output endpoint found");

  currentConnection = {
    type: "usb",
    name: device.productName || "Brother QL",
    send: async (data) => { await device.transferOut(outEndpoint.endpointNumber, data); },
    disconnect: async () => { await device.close(); currentConnection = null; },
  };
  return getPrinterStatus();
}

// ---------------- Bluetooth ----------------
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
    name: device.name || "Brother QL (BT)",
    send: async (data) => {
      const CHUNK = 512;
      for (let i = 0; i < data.length; i += CHUNK) {
        await writeChar.writeValueWithoutResponse(data.slice(i, i + CHUNK));
      }
    },
    disconnect: async () => { device.gatt?.disconnect(); currentConnection = null; },
  };
  return getPrinterStatus();
}

// ---------------- Network bridge ----------------
/**
 * Validate the bridge is reachable and persist the URL for this device.
 * URL example: "https://192.168.1.50:9443" or "https://print-bridge.local:9443"
 */
export async function connectBridge(rawUrl: string): Promise<PrinterStatus> {
  const url = rawUrl.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) throw new Error("Bridge URL must start with http:// or https://");
  const res = await fetch(`${url}/status`, { method: "GET" });
  if (!res.ok) throw new Error(`Bridge /status returned ${res.status}`);
  const info = await res.json();
  saveBridgeUrl(url);

  currentConnection = {
    type: "bridge",
    name: `Bridge → ${info.target || info.transport || url}`,
    send: async (data) => {
      // Convert to base64 in chunks (avoid call-stack overflow on large rasters)
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < data.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(data.subarray(i, i + CHUNK)));
      }
      const rasterBase64 = btoa(binary);
      const r = await fetch(`${url}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rasterBase64 }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`Bridge print failed: ${r.status} ${text}`);
      }
    },
    disconnect: async () => { currentConnection = null; },
  };
  return getPrinterStatus();
}

/** Reconnect to a previously-saved bridge silently (used on app load). */
export async function tryRestoreBridge(): Promise<PrinterStatus | null> {
  const saved = getSavedBridgeUrl();
  if (!saved) return null;
  try { return await connectBridge(saved); } catch { return null; }
}

export async function disconnectPrinter(): Promise<void> {
  if (currentConnection) {
    await currentConnection.disconnect();
    currentConnection = null;
  }
}

// ---------------- Label rendering ----------------
export async function printNameTag(opts: {
  childName: string;
  roomName: string;
  allergies?: string | null;
  parentName?: string;
  date?: string;
}): Promise<void> {
  if (!currentConnection) throw new Error("No printer connected");

  const canvas = document.createElement("canvas");
  const WIDTH = 720;   // 62mm tape width in dots
  const HEIGHT = 450;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, WIDTH, 80);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("KIDS CHECK-IN", 20, 55);

  ctx.fillStyle = "#000000";
  ctx.font = "bold 60px sans-serif";
  ctx.fillText(opts.childName, 20, 170);

  ctx.font = "36px sans-serif";
  ctx.fillText(`Room: ${opts.roomName}`, 20, 230);

  if (opts.parentName) {
    ctx.font = "28px sans-serif";
    ctx.fillStyle = "#555555";
    ctx.fillText(`Parent: ${opts.parentName}`, 20, 290);
  }
  ctx.font = "24px sans-serif";
  ctx.fillStyle = "#888888";
  ctx.fillText(opts.date || new Date().toLocaleDateString(), 20, 340);

  if (opts.allergies) {
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(0, 370, WIDTH, 80);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(`⚠ ALLERGY: ${opts.allergies}`, 20, 420);
  }

  const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const rasterData = buildBrotherRaster(imageData, WIDTH, HEIGHT);
  await currentConnection.send(rasterData);
}

/** Test print without check-in context — for the Settings UI. */
export async function printTestLabel(): Promise<void> {
  await printNameTag({
    childName: "Test Print",
    roomName: "Test Room",
    parentName: "HOTC Print Bridge",
    date: new Date().toLocaleString(),
  });
}

function buildBrotherRaster(imageData: ImageData, width: number, height: number): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const commands: number[] = [];
  commands.push(...Array(200).fill(0x00));
  commands.push(0x1b, 0x40);
  commands.push(0x1b, 0x69, 0x61, 0x01);
  commands.push(0x1b, 0x69, 0x7a);
  commands.push(0x86, 0x0a, 0x3e, 0x00);
  commands.push(height & 0xff, (height >> 8) & 0xff, (height >> 16) & 0xff, (height >> 24) & 0xff);
  commands.push(0x00, 0x00, 0x00, 0x00);
  commands.push(0x1b, 0x69, 0x4d, 0x40);
  commands.push(0x1b, 0x69, 0x4b, 0x08);
  commands.push(0x1b, 0x69, 0x64, 0x23, 0x00);

  for (let y = 0; y < height; y++) {
    commands.push(0x67, 0x00, bytesPerRow);
    for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteIdx * 8 + bit;
        if (x < width) {
          const pixelIdx = (y * width + x) * 4;
          const r = imageData.data[pixelIdx];
          const g = imageData.data[pixelIdx + 1];
          const b = imageData.data[pixelIdx + 2];
          if ((r + g + b) / 3 < 128) byte |= 1 << (7 - bit);
        }
      }
      commands.push(byte);
    }
  }
  commands.push(0x1a);
  return new Uint8Array(commands);
}

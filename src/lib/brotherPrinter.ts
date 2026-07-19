/**
 * Brother QL-800 / QL-1110NWB label printer integration.
 *
 * Three transports are supported:
 *   - "usb"       Web USB (Chrome/Edge on Mac/PC kiosks)
 *   - "bluetooth" Web Bluetooth (Chrome/Edge desktop, Android)
 *   - "bridge"    HTTPS POST to a LAN print bridge (iPad/Android/phones).
 *                 Open source: github.com/AnderianInc/teams-hotc → /print-bridge
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
  // Brother QL-810W has no Bluetooth; QL-820NWB uses Bluetooth Classic (SPP),
  // which Web Bluetooth (BLE/GATT) cannot pair with. Hide the option.
  return false;
}
/** Network bridge works in every browser — only requires fetch. */
export function isBridgeAvailable(): boolean {
  return typeof fetch !== "undefined";
}

export function getPrinterStatus(): PrinterStatus {
  if (!currentConnection) return { connected: false, type: null, name: null };
  return { connected: true, type: currentConnection.type, name: currentConnection.name };
}

/**
 * Actively verify the printer is still reachable RIGHT NOW.
 * - Bridge: pings `/status` (catches "bridge PC went to sleep" etc.)
 * - USB/BT: relies on the live device handle
 * Throws with a human-readable message if unreachable.
 */
export async function verifyPrinterOnline(): Promise<PrinterStatus> {
  if (!currentConnection) throw new Error("No printer connected. Connect a printer before checking in.");
  if (currentConnection.type === "bridge") {
    const saved = getSavedBridgeUrl();
    if (!saved) throw new Error("Bridge URL missing");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(`${saved}/status`, { method: "GET", signal: ctrl.signal });
      if (!r.ok) throw new Error(`Bridge unreachable (HTTP ${r.status})`);
      const info = await r.json().catch(() => ({}));
      const reachable = info?.reachable ?? info?.printerConnected;
      if (reachable === false) {
        throw new Error("Bridge is up but the printer is not reachable. Check the printer power/USB/Wi-Fi.");
      }
    } catch (e: any) {
      if (e.name === "AbortError") throw new Error("Printer bridge did not respond (timeout).");
      throw new Error(e.message || "Printer bridge unreachable");
    } finally {
      clearTimeout(timer);
    }
  }
  return getPrinterStatus();
}

export function getSavedBridgeUrl(): string {
  try { return localStorage.getItem(BRIDGE_URL_KEY) || ""; } catch { return ""; }
}
export function saveBridgeUrl(url: string) {
  try { localStorage.setItem(BRIDGE_URL_KEY, url); } catch { /* ignore */ }
}

export function normalizeBridgeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function fetchBridgeStatus(url: string, timeoutMs = 6000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/status`, { method: "GET", signal: ctrl.signal });
    if (!res.ok) throw new Error(`Bridge responded with HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Bridge did not respond. Confirm the bridge app is open and this device is on the same wifi.");
    }
    if (e instanceof TypeError) {
      throw new Error(
        "Could not reach the bridge. Open the bridge URL in a new browser tab first and approve the certificate warning, then try again.",
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- USB ----------------
export async function connectUSB(): Promise<PrinterStatus> {
  if (!isUSBAvailable()) throw new Error("Web USB not supported in this browser");
  const device = await (navigator as any).usb.requestDevice({
    filters: QL_PRODUCT_IDS.map((pid) => ({ vendorId: BROTHER_VENDOR_ID, productId: pid })),
  });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  try {
    await device.claimInterface(0);
  } catch (e: any) {
    await device.close().catch(() => {});
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    throw new Error(
      isMac
        ? "macOS is holding the printer. Open System Settings → Printers & Scanners, remove the Brother QL printer, unplug/replug the USB cable, then try Connect USB again. (Or use the Network bridge instead — it works alongside the macOS driver.)"
        : "Another program is using the printer. Close any Brother software / print queues and unplug/replug the USB cable, then try again. Or use the Network bridge instead."
    );
  }
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
  const url = normalizeBridgeUrl(rawUrl);
  if (!url) throw new Error("Enter the bridge URL");
  if (!/^https?:\/\//.test(url)) throw new Error("Bridge URL must start with http:// or https://");
  const info = await fetchBridgeStatus(url);
  const reachable = info?.reachable ?? info?.printerConnected;
  if (reachable === false) {
    throw new Error("Bridge is running, but the printer is not reachable. Check printer power, USB/Wi-Fi, and bridge settings.");
  }
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

/**
 * Auto-discover a print bridge on the LAN without any user input.
 *
 * Real DNS-SD service browsing isn't exposed to web pages, but every modern
 * OS (iOS, macOS, Windows 10+, most Android) resolves `.local` hostnames
 * via mDNS. The bridge advertises itself as `hotc-print-bridge.local`, so
 * we just probe that (and a couple of common fallbacks) in parallel and
 * connect to the first one that answers.
 */
const DISCOVERY_CANDIDATES = [
  "https://hotc-print-bridge.local:9443",
  "https://print-bridge.local:9443",
  "https://localhost:9443",
];

export async function discoverBridge(
  extraCandidates: string[] = [],
  timeoutMs = 1500,
): Promise<string | null> {
  const candidates = [...new Set([...extraCandidates, ...DISCOVERY_CANDIDATES])];
  const probe = (url: string) =>
    new Promise<string | null>((resolve) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const normalized = normalizeBridgeUrl(url);
      fetch(`${normalized}/status`, { method: "GET", signal: ctrl.signal })
        .then((r) => resolve(r.ok ? normalized : null))
        .catch(() => resolve(null))
        .finally(() => clearTimeout(timer));
    });
  const results = await Promise.all(candidates.map(probe));
  return results.find((u) => u) || null;
}

/** Try saved bridge first, then auto-discover. Used on app load. */
export async function tryAutoConnectBridge(): Promise<PrinterStatus | null> {
  const restored = await tryRestoreBridge();
  if (restored) return restored;
  const found = await discoverBridge();
  if (!found) return null;
  try { return await connectBridge(found); } catch { return null; }
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
  // QL-820NWB uses a fixed 720-dot (90-byte) print buffer for 62mm continuous tape.
  const bytesPerRow = 90;
  const commands: number[] = [];

  // 1. Invalidate: >=200 null bytes clears any partial job in the printer buffer.
  commands.push(...Array(200).fill(0x00));
  // 2. Initialize: ESC @
  commands.push(0x1b, 0x40);
  // 3. Switch to raster graphics mode: ESC i a 0x01
  commands.push(0x1b, 0x69, 0x61, 0x01);

  // 4. Print information command: ESC i z {n1..n10}
  //    n1 = valid-flag: PI_KIND|PI_WIDTH|PI_LENGTH|PI_QUALITY|PI_RECOVER = 0x8E
  //    n2 = media type: 0x0A continuous length tape
  //    n3 = media width in mm: 0x3E = 62
  //    n4 = media length in mm: 0 for continuous
  //    n5..n8 = raster row count (little-endian 32-bit)
  //    n9 = starting page (0), n10 = 0
  //    Without a valid n1 the QL-820NWB falls back to its last media (address label).
  const rasterCount = height;
  commands.push(0x1b, 0x69, 0x7a);
  commands.push(0x8e, 0x0a, 0x3e, 0x00);
  commands.push(rasterCount & 0xff, (rasterCount >> 8) & 0xff, (rasterCount >> 16) & 0xff, (rasterCount >> 24) & 0xff);
  commands.push(0x00, 0x00);

  // 5. Auto-cut every page: ESC i M 0x40
  commands.push(0x1b, 0x69, 0x4d, 0x40);
  // 6. Cut at end: ESC i K 0x08
  commands.push(0x1b, 0x69, 0x4b, 0x08);
  // 7. Feed margin for continuous tape: ESC i d 35 0
  commands.push(0x1b, 0x69, 0x64, 0x23, 0x00);
  // 8. Compression mode: M 0x00 (no compression) — matches the raw rows below.
  commands.push(0x4d, 0x00);

  for (let y = 0; y < height; y++) {
    // Raster line: g 0x00 0x5A + 90 pixel bytes
    commands.push(0x67, 0x00, 0x5a);
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
  // Print with feeding (end of job)
  commands.push(0x1a);
  return new Uint8Array(commands);
}

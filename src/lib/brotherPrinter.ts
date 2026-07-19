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
export type LabelCopy = "child" | "parent" | "teacher";

export interface NameTagOptions {
  childName: string;
  roomName: string;
  securityCode: string;
  copy: LabelCopy;
  allergies?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  date?: string;
}

const MIRROR_KEY = "hotc.printMirror";
export function getMirrorPrint(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MIRROR_KEY) === "1";
}
export function setMirrorPrint(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MIRROR_KEY, on ? "1" : "0");
}

/**
 * Render a label to a canvas. Pure — no printer I/O. Used by both the print
 * path and the on-screen preview so what you see is exactly what is sent.
 */
export function renderLabelCanvas(opts: NameTagOptions): HTMLCanvasElement {
  const WIDTH = 720;
  const isLandscape = opts.copy === "child";
  const HEIGHT = isLandscape ? 1200 : 600;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const mirror = getMirrorPrint();
  if (mirror) {
    // Flip horizontally so bytes packed MSB-first land as a mirrored image
    // on printers that read pins in the opposite direction.
    ctx.translate(WIDTH, 0);
    ctx.scale(-1, 1);
  }

  if (isLandscape) {
    const labelLength = HEIGHT;
    const tapeWidth = WIDTH;
    ctx.save();
    ctx.translate(0, HEIGHT);
    ctx.rotate(-Math.PI / 2);
    drawLabel(ctx, labelLength, tapeWidth, opts);
    ctx.restore();
  } else {
    drawLabel(ctx, WIDTH, HEIGHT, opts);
  }
  return canvas;
}

/** DataURL of the exact bitmap that will be sent — for on-screen preview. */
export function renderLabelPreviewDataUrl(opts: NameTagOptions): string {
  return renderLabelCanvas(opts).toDataURL("image/png");
}

export async function printNameTag(opts: NameTagOptions): Promise<void> {
  if (!currentConnection) throw new Error("No printer connected");
  const canvas = renderLabelCanvas(opts);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rasterData = buildBrotherRaster(imageData, canvas.width, canvas.height);
  await currentConnection.send(rasterData);
}

/** Print child + parent + teacher copies for a single check-in. */
export async function printCheckInLabels(base: Omit<NameTagOptions, "copy">): Promise<void> {
  const copies: LabelCopy[] = ["child", "parent", "teacher"];
  for (const copy of copies) {
    await printNameTag({ ...base, copy });
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Test print without check-in context — for the Settings UI. */
export async function printTestLabel(): Promise<void> {
  await printNameTag({
    copy: "child",
    childName: "Test Print",
    roomName: "Test Room",
    securityCode: "TEST01",
    parentName: "HOTC Print Bridge",
    date: new Date().toLocaleString(),
  });
}

/** Short human-readable security code (6 chars, no ambiguous glyphs). */
export function generateSecurityCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  labelLength: number,
  tapeWidth: number,
  opts: NameTagOptions,
) {
  const padding = 24;
  const innerW = labelLength - padding * 2;
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const headerLabel =
    opts.copy === "parent" ? "PARENT PICKUP" : opts.copy === "teacher" ? "TEACHER COPY" : "CHILD";
  ctx.font = "700 28px Arial, sans-serif";
  ctx.fillText(headerLabel, padding, padding);
  ctx.fillRect(padding, padding + 34, innerW, 3);

  const contentTop = padding + 52;
  const contentBottom = tapeWidth - padding;
  const contentH = contentBottom - contentTop;

  if (opts.copy === "parent") {
    drawFittedText(ctx, opts.childName, padding, contentTop, innerW, 80, 700, 72, 44);
    ctx.font = "600 34px Arial, sans-serif";
    ctx.fillText(`Class: ${opts.roomName}`, padding, contentTop + 96);
    ctx.font = "600 22px Arial, sans-serif";
    ctx.fillText("PICKUP CODE — must match child's tag", padding, contentTop + 144);
    ctx.font = "800 128px 'Courier New', monospace";
    ctx.fillText(opts.securityCode, padding, contentTop + 176);
    return;
  }

  if (opts.copy === "teacher") {
    drawFittedText(ctx, opts.childName, padding, contentTop, innerW, 80, 700, 72, 44);
    ctx.font = "600 34px Arial, sans-serif";
    ctx.fillText(`Class: ${opts.roomName}`, padding, contentTop + 96);
    if (opts.parentName) {
      ctx.font = "500 26px Arial, sans-serif";
      ctx.fillText(
        `Guardian: ${opts.parentName}${opts.parentPhone ? " · " + opts.parentPhone : ""}`,
        padding,
        contentTop + 140,
      );
    }
    ctx.font = "800 32px 'Courier New', monospace";
    ctx.fillText(`Code: ${opts.securityCode}`, padding, contentTop + 180);
    if (opts.allergies) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(padding, contentTop + 224, innerW, 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 30px Arial, sans-serif";
      ctx.fillText(`ALLERGIES: ${opts.allergies}`, padding + 10, contentTop + 238);
    }
    return;
  }

  // CHILD copy — big name centered, class + code larger at bottom
  const nameMaxH = contentH - 150;
  drawFittedNameCentered(ctx, opts.childName, padding, contentTop, innerW, nameMaxH);
  ctx.fillStyle = "#000000";
  ctx.font = "700 44px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Class: ${opts.roomName}`, padding + innerW / 2, contentBottom - 110);
  ctx.font = "800 52px 'Courier New', monospace";
  ctx.fillText(`Code ${opts.securityCode}`, padding + innerW / 2, contentBottom - 56);
  ctx.textAlign = "left";
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  weight: number,
  maxSize: number,
  minSize: number,
) {
  let size = maxSize;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  while (size >= minSize) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxW && size <= maxH) break;
    size -= 2;
  }
  ctx.fillText(text, x, y, maxW);
}

function drawFittedNameCentered(
  ctx: CanvasRenderingContext2D,
  rawName: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  const name = rawName.trim().replace(/\s+/g, " ") || "Name";
  const words = name.split(" ");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000000";

  let lines = [name];
  let chosen = 44;
  for (let size = 120; size >= 44; size -= 2) {
    ctx.font = `800 ${size}px Arial, sans-serif`;
    if (ctx.measureText(name).width <= maxW && size <= maxH) {
      lines = [name];
      chosen = size;
      break;
    }
    if (words.length >= 2) {
      let best: string[] | null = null;
      let bestScore = Infinity;
      for (let i = 1; i < words.length; i++) {
        const cand = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
        const w = cand.map((l) => ctx.measureText(l).width);
        const score = Math.max(...w) + Math.abs(w[0] - w[1]);
        if (score < bestScore) {
          bestScore = score;
          best = cand;
        }
      }
      const lh = size * 1.05;
      if (best && lh * 2 <= maxH && best.every((l) => ctx.measureText(l).width <= maxW)) {
        lines = best;
        chosen = size;
        break;
      }
    }
  }

  ctx.font = `800 ${chosen}px Arial, sans-serif`;
  const lh = chosen * 1.05;
  const cx = x + maxW / 2;
  const cy = y + maxH / 2;
  const startY = cy - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lh, maxW));
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
  //    This app is intentionally NOT sending an address-label profile.
  //    It declares 62mm continuous tape: the same 2.4" Black/Red roll shown in
  //    Brother Editor. On QL-820NWB, that media must be printed in two-color
  //    mode even when the red plane is blank; otherwise the firmware returns
  //    "Wrong Roll Type / Check the print data".
  //    n1 = 0x8E: media type, media width, media length, printer recovery valid
  //    n2 = 0x0A: continuous length tape
  //    n3 = 0x3E: 62mm width
  //    n4 = 0x00: continuous tape length
  //    n5..n8 = raster row count (little-endian 32-bit) — still required
  //    n9 = starting page (0), n10 = 0
  const rasterCount = height;
  commands.push(0x1b, 0x69, 0x7a);
  commands.push(0x8e, 0x0a, 0x3e, 0x00);
  commands.push(rasterCount & 0xff, (rasterCount >> 8) & 0xff, (rasterCount >> 16) & 0xff, (rasterCount >> 24) & 0xff);
  commands.push(0x00, 0x00);

  // 5. Auto-cut every page: ESC i M 0x40
  commands.push(0x1b, 0x69, 0x4d, 0x40);
  // 6. Expanded mode: ESC i K 0x09 = two-color printing + cut at end.
  //    Required for QL-820NWB Black/Red media, even for black-only labels.
  commands.push(0x1b, 0x69, 0x4b, 0x09);
  // 7. Feed margin for continuous tape: ESC i d 35 0
  commands.push(0x1b, 0x69, 0x64, 0x23, 0x00);
  // 8. Compression mode: M 0x00 (no compression) — matches the raw rows below.
  commands.push(0x4d, 0x00);

  const blankRedPlane = new Array(bytesPerRow).fill(0x00);

  for (let y = 0; y < height; y++) {
    // Two-color raster line pair:
    //   w 01 5A + black plane bytes
    //   w 02 5A + red plane bytes (blank; we only print the name in black)
    commands.push(0x77, 0x01, 0x5a);
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
    commands.push(0x77, 0x02, 0x5a, ...blankRedPlane);
  }
  // Print with feeding (end of job)
  commands.push(0x1a);
  return new Uint8Array(commands);
}

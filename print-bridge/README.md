# HOTC Print Bridge

A tiny LAN server that lets the HOTC Volunteer Hub web app print Brother QL
labels from **any device on the church wifi** — iPads, Android tablets, phones,
or laptops.

```
[ iPad / phone ]  --HTTPS over wifi-->  [ Bridge PC ]  --USB or TCP:9100-->  [ Brother QL-1110NWB ]
```

The web app stays at `teams.hotc.life` (loaded over the internet once, cached
by the PWA). Check-ins still record to the cloud. The bridge only handles
the *physical printing*.

---

## 1. Pick a bridge host

A small always-on PC near the printer — a spare Windows mini-PC, Mac mini, or
old laptop is fine. Needs Node.js 18+ and to be on the church wifi.

## 2. Connect the printer

**Option A — Network (recommended for QL-1110NWB):**
Plug the printer into church wifi. Find its IP from the printer's LCD or your
router. Note it — e.g. `192.168.1.60`.

**Option B — USB:** plug printer USB into the bridge PC. On macOS, install the Brother driver and add the printer in System Settings first; the bridge will auto-detect a Brother/QL CUPS printer, or you can set `MAC_PRINTER=<printer-name>` beside the app.

## 3. Install & configure

**Two ways to install:**

**A) Prebuilt binary (recommended for volunteers)** — grab the file for your OS from
[GitHub Releases](https://github.com/AnderianInc/teams-hotc/releases):

- **Windows** — `hotc-print-bridge-win.exe`, double-click.
- **macOS Apple Silicon (M1/M2/M3)** — `hotc-print-bridge-macos-arm64.zip`, unzip, then **right-click** `run.command` → **Open** → **Open** (needed once because the app is unsigned; macOS quarantines unsigned bare binaries and shows them as gibberish in TextEdit, which is why we ship a `.zip` with a launcher).
- **macOS Intel** — `hotc-print-bridge-macos-intel.zip`, same as above. For a USB printer installed on this Mac, no `.env` is usually needed; the bridge auto-detects a Brother/QL printer through macOS printing.
- **Linux** — `hotc-print-bridge-linux.zip`, unzip, `chmod +x hotc-print-bridge-linux`, run.

No Node.js required. Skip to the `.env` step.


**B) From source (contributors / developers)**:

```bash
git clone https://github.com/AnderianInc/teams-hotc.git
cd teams-hotc/print-bridge
npm install
cp .env.example .env   # then edit
```


Edit `.env`:

```
# Network printer (preferred)
PRINTER_HOST=192.168.1.60
PRINTER_PORT=9100

# OR Linux USB
# USB_DEVICE=/dev/usb/lp0

# OR Windows (printer installed in Windows under this exact name)
# WIN_PRINTER=Brother QL-1110NWB

# OR macOS USB/CUPS (optional; auto-detected if omitted)
# MAC_PRINTER=Brother_QL_820NWB

HTTP_PORT=9999
HTTPS_PORT=9443
```

Source installs should generate a self-signed cert (one-time, lasts 10 years). Prebuilt binaries generate one automatically next to the app on first launch.

```bash
./generate-cert.sh
```

Start the bridge:

```bash
node server.js
# → HTTP  listening on 0.0.0.0:9999
# → HTTPS listening on 0.0.0.0:9443
```

Verify from any browser on the wifi: `https://<bridge-ip>:9443/status`
You'll get a TLS warning the first time — that's expected for self-signed.

## 4. Trust the cert on each kiosk (mobile only)

The web app is loaded over HTTPS (`teams.hotc.life`), so browsers refuse to
POST to plain HTTP. The bridge ships HTTPS using the self-signed cert. To make
iOS and Android trust it:

**iPad / iPhone:**
1. AirDrop or email `print-bridge/cert/cert.pem` to the device.
2. Open it, then **Settings → General → VPN & Device Management → Install Profile**.
3. **Settings → General → About → Certificate Trust Settings** → enable full trust.

**Android (Chrome):**
- Settings → Security → Encryption & credentials → Install a certificate → CA certificate.

**Mac / Windows laptops:**
- Open `cert.pem`, mark "Always Trust" in Keychain (Mac) or import to "Trusted Root Certification Authorities" (Windows).

## 5. Point the web app at the bridge

The kiosk **auto-discovers** the bridge on the same wifi via mDNS —
no IP entry needed. On first load it probes `hotc-print-bridge.local:9443`
and connects automatically. You can also tap **Printer button → Network
bridge → Auto-find bridge** at any time.

Important: because `teams.hotc.life` is HTTPS, the browser will not let the app talk to the local bridge until this device trusts the bridge certificate. In the printer popover, click **Open status** first. If the status page opens with a privacy warning, approve it once, then return to the app and click **Connect**.

Manual fallback (if mDNS is blocked on your network): paste
`https://<bridge-ip>:9443` into the same popover. The URL is remembered
per device.


## 6. Auto-start at boot

**Windows:** put a shortcut to `start-bridge.bat` in `shell:startup`.
**macOS:** load the `com.hotc.printbridge.plist` (sample below) with `launchctl`.
**Linux:** systemd unit (sample below).

---

## API (for debugging)

`GET /status` → `{ ok, transport, target, reachable }`

`POST /print` body:
```json
{ "rasterBase64": "<base64 raw Brother raster bytes>" }
```

The web app builds the raster bytes client-side (see `src/lib/brotherPrinter.ts`)
so the bridge is printer-format agnostic — it just forwards bytes.

## Troubleshooting

- **"Could not reach the bridge" / "Failed to fetch"** — usually the bridge certificate is not trusted on this device, or the bridge app is not running. Open `https://<bridge-ip>:9443/status` or use **Open status** in the app, approve the warning once, then retry.
- **`/status` says `reachable: false`** — printer is off, on a different wifi,
  `PRINTER_HOST` is wrong, or macOS/Windows does not have the Brother printer installed.
- **Label prints blank or garbled** — wrong tape loaded; QL-1110NWB needs
  DK-2205 continuous or DK-1247 die-cut tape.

---

## Contributing

The bridge is open source under the [AnderianInc/teams-hotc](https://github.com/AnderianInc/teams-hotc) repo.
PRs welcome — issues, driver support for other printers, or improved installers.

Tagged releases (`print-bridge-v*`) auto-build Windows / macOS / Linux binaries via GitHub Actions
(`.github/workflows/print-bridge-release.yml`) using [`pkg`](https://github.com/vercel/pkg).
To cut a release locally: `npm run build` inside `print-bridge/`.

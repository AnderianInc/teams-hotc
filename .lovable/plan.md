## Three fixes for Children's check-in + Print Bridge

### 1. Fix wrong label data sent to QL-820NWB (address-label look)

**Root cause (confirmed by reading `src/lib/brotherPrinter.ts` `buildBrotherRaster`):** the "print information" command (`ESC i z`) is malformed. The Brother raster spec requires exactly 10 parameter bytes:

```
n1 media type   0x0A continuous / 0x0B die-cut
n2 media width  mm (62 for the 62mm continuous tape)
n3 media length mm (0 for continuous)
n4-n7 raster number (little-endian 32-bit)
n8 starting page (0)
n9 0
n10 0
```

Today we send `0x86, 0x0a, 0x3e, 0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00` — that's **12 bytes**, and n1=`0x86` is not a valid media type. The QL-820NWB falls back to its last known media (an address die-cut label), which is why the output looks like an address label and mis-registers.

Also missing: the mandatory "switch to raster mode" command `ESC i a 0x01` is already there, but we never send `ESC i z` with the `PI_KIND | PI_WIDTH | PI_LENGTH | PI_QUALITY | PI_RECOVER` valid-flag byte first. That valid-flag byte is n0, and it must be `0x8E` (0x02+0x04+0x08+0x40+0x80) for continuous tape.

Fix `buildBrotherRaster`:
- Send `ESC i z` header as: `1B 69 7A  8E 0A 3E 00  <raster_bytes_LE_32>  00 00 00`
- Compute `raster_bytes` = actual pixel rows generated (currently 450).
- Also set "auto-cut every 1 page": `ESC i M 0x40` (already sent) and "cut at end": `ESC i K 0x08` (already sent) — keep.
- Verify tape width: 62 mm continuous tape uses **90 printable bytes per row** (720 dots is correct). Confirm `WIDTH = 720` matches, but change raster row command from `0x67 0x00 <bytesPerRow>` to the newer graphics transfer `0x67 0x00 0x5A` (90 = 0x5A) when tape is 62mm, padding each row to 90 bytes as the spec requires. Currently we emit `ceil(720/8)=90` which is right, but we should hard-code `0x5A` so it never drifts.
- Add a final `ESC i R 0x01` (initialize) at the very start after the 200 null bytes, before `ESC @`, per Brother reference.

Result: the QL-820NWB will identify the media as 62 mm continuous, print full-width, and stop treating the job as an address label.

### 2. Prevent duplicate check-in for the same child + same service

**Root cause:** `CheckInConfirm.tsx` always inserts a new row into `check_ins`. Nothing checks whether that child already has an open (not checked-out) row for today's `service_id`. Result: the same child appears multiple times in "ready to check out".

Fix in two places:

a. Database — add a **partial unique index** so re-inserts fail atomically even under race:
```sql
CREATE UNIQUE INDEX check_ins_one_open_per_child_service
  ON public.check_ins (child_id, service_id)
  WHERE checked_out_at IS NULL;
```

b. UI (`CheckInConfirm.tsx`) — before verifying printer, run:
```ts
const { data: existing } = await supabase
  .from("check_ins")
  .select("id, checked_in_at")
  .eq("child_id", child.id)
  .eq("service_id", activeService.id)
  .is("checked_out_at", null)
  .maybeSingle();
if (existing) throw new Error("Already checked in for this service.");
```
Also show an "Already checked in" badge on the confirm card (query runs in `useQuery`) and disable the button when present, so staff see it before clicking.

### 3. Bridge unreachable from other devices on the same wifi

You can hit the bridge from the host PC's own browser (via its own LAN IP), but a phone on the same wifi can't reach `https://<ip>:9443` or `hotc-print-bridge.local:9443`. The bridge already binds to `0.0.0.0` and advertises mDNS, so the code is fine — the block is on the network side. Two things to fix, one code, one docs:

**Code — `PrinterConnect.tsx` diagnostics:**
- Add a "Diagnose bridge" button that fetches `/status` and reports the specific failure mode (timeout vs cert vs DNS) so the user knows whether it's a firewall or a certificate problem.
- When `discoverBridge()` fails, surface a hint: "If the bridge PC is on Windows, allow inbound TCP 9443 through Windows Defender Firewall for Private networks. On macOS, System Settings → Network → Firewall → Allow `hotc-print-bridge`."

**Docs — `src/content/help/articles/kids-setup.md` + `print-bridge/README.md`:**
Add a "Bridge reachable from host but not from other devices" section listing the exact fixes in priority order:
1. **Windows firewall:** `New-NetFirewallRule -DisplayName "HOTC Print Bridge" -Direction Inbound -LocalPort 9443,9999 -Protocol TCP -Action Allow -Profile Private`
2. **macOS firewall:** allow incoming for the `hotc-print-bridge-macos` binary the first time it prompts, or add it manually under Firewall Options.
3. **Wifi client isolation / "AP isolation":** many church/guest wifi APs block device-to-device traffic. Test by tethering a phone to a laptop's hotspot; if it works there, ask the wifi admin to disable client isolation on the SSID the kiosks and bridge PC use.
4. **mDNS on Windows:** `hotc-print-bridge.local` only resolves if Bonjour is installed (comes with iTunes or Bonjour Print Services). Fall back to the LAN IP printed in the bridge console.

No change needed to `server.js` for reachability — it already binds `0.0.0.0` on both HTTP and HTTPS.

### Files touched

- `src/lib/brotherPrinter.ts` — rewrite `buildBrotherRaster` header per spec above.
- `src/components/kids/CheckInConfirm.tsx` — pre-check for open check-in, show "Already checked in" state.
- New migration — partial unique index on `check_ins`.
- `src/components/kids/PrinterConnect.tsx` — "Diagnose bridge" button + firewall hints.
- `src/content/help/articles/kids-setup.md` and `print-bridge/README.md` — reachability troubleshooting.

### Out of scope

- Changing transport (USB vs bridge) — the QL-820NWB print-data fix applies to both.
- Auto-opening firewall ports from the bridge binary (would require admin elevation + code signing).

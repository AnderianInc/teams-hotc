# Children's check-in / check-out

Open **Check-In** from the sidebar. Search by child or last name, tap **Check In**, and (if a label printer is paired) a security label prints automatically.

## Offline mode
If the kiosk loses connectivity, check-ins are queued locally in IndexedDB and uploaded when the connection returns. The status bar shows pending count.

## Check-out
Open the **Check Out** tab, scan or enter the security code from the parent's slip, and confirm.

## Printers
We support Brother QL-800 / QL-1110NWB labels. Three connection options:

- **USB** — Chrome/Edge on a Mac or PC kiosk with the printer plugged in.
- **Bluetooth** — Chrome/Edge desktop or Android with a Bluetooth-capable QL.
- **Network bridge** — Required for iPad/iPhone and recommended for shared printers.
  Download the prebuilt binary from [GitHub Releases](https://github.com/AnderianInc/teams-hotc/releases)
  (or run from source in `/print-bridge`) on a PC near the printer, then paste its URL
  (e.g. `https://192.168.1.50:9443`) into the **Network bridge** popover in the kiosk header.
  Saved per device. See the Kids Setup Guide for the full walkthrough including
  the one-time iOS certificate trust step.

Use **Test** next to a connected printer to confirm output before service.

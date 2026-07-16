# Children's Ministry setup guide

This is the complete walk-through for setting up the kids check-in kiosk, printer, and print bridge — and running check-in on a Sunday morning.

## 1. How the pieces fit together

There are three things involved during check-in:

```
[ iPad / phone / laptop ]   ← volunteers use this to check kids in
        │  wifi (opens teams.hotc.life)
        ▼
[  Lovable Cloud (internet) ]   ← saves the check-in record
        ▲
        │  wifi (label data)
[  Bridge PC on church wifi  ]   ← small always-on computer near the printer
        │  USB or wifi
        ▼
[  Brother QL label printer  ]   ← prints the name tag + parent slip
```

- **Kiosk**: any iPad, iPhone, Android tablet, Mac or PC on the church wifi. Just opens `teams.hotc.life` in a browser.
- **Bridge PC**: a small always-on computer (a Mac mini, an Intel NUC, or any spare laptop) that sits near the printer and runs one small program. Mobile browsers can't talk directly to network printers, so the bridge does that step for us.
- **Printer**: the Brother QL-800 or QL-1110NWB. Plugs into the bridge PC by USB, or joins the church wifi.

**If any piece is off:**
- Kiosk offline → check-ins queue on the device and upload when it reconnects. No labels print until the printer is reachable.
- Bridge PC off → check-ins still save to the cloud; labels don't print. Turn it back on and everything resumes.
- Printer off → same as above.

## 2. Set up the Bridge PC (one time)

Any always-on Windows or Mac computer works. Only needs to be done once.

**Install Node.js 18+** from [nodejs.org](https://nodejs.org).

**Get the bridge software** — the `print-bridge` folder from this project. Copy it to the PC.

Open a terminal (or Command Prompt) inside that folder and run:

```
npm install
```

**Generate the security certificate** so iPads can talk to it:

- macOS / Linux: `./generate-cert.sh`
- Windows: double-click `start-bridge.bat` — it does the same thing

**Start the bridge**:

```
npm start
```

You should see something like `Print bridge listening on https://192.168.1.50:9443`. Write down that IP address as a fallback — normally auto-discovery finds it.

### Make it start automatically

You want this running whenever the PC is on.

- **Windows**: Task Scheduler → Create Basic Task → Trigger "At log on" → Action "Start a program" → point at `start-bridge.bat`.
- **macOS**: create a LaunchAgent that runs `npm start` inside the `print-bridge` folder at login. If you're not sure, just leave a shortcut on the desktop and double-click it when you arrive on Sunday.

## 3. Set up the Brother QL printer

**Load labels**: DK-2205 continuous 2.4" (62mm) roll works best for name tags.

**Connect to the bridge PC** — pick one:

- **USB (easiest, required for QL-810W)**: plug the printer into the bridge PC. Install the Brother P-touch driver from brother.com. Done.
- **Wifi (QL-820NWB / QL-1110NWB only)**: use Brother's iPrint&Label app to join the printer to the church wifi. In the bridge software's `.env` file (see `print-bridge/.env.example`), set the printer's IP address.

> **Bluetooth note:** The QL-810W has no Bluetooth. The QL-820NWB has Bluetooth *Classic (SPP)*, which browsers cannot pair with — connect it by USB or wifi via the bridge instead.

**Test it** by opening `https://<bridge-ip>:9443` in a browser on the bridge PC — there's a Test Print button.

## 4. Set up the kiosk (iPad / phone / laptop)

On each device volunteers will use:

1. Open **teams.hotc.life** in Safari (iPad/iPhone) or Chrome (Android/Mac/PC).
2. Sign in as a Children's Ministry volunteer.
3. Add to Home Screen for full-screen mode:
   - **iPad/iPhone**: Share button → *Add to Home Screen*.
   - **Android**: three-dot menu → *Add to Home screen*.
4. Open **Children's Ministry → Check-In**.
5. Tap the printer icon in the header → **Auto-find bridge**. It should discover the bridge automatically. If not, tap **Manual** and paste the IP from step 2.

### One-time cert trust on iPad

Because the bridge uses a self-signed HTTPS certificate, iOS asks you to trust it once per device:

1. Tap **Auto-find bridge**. Safari shows a "not private" warning.
2. Tap **Advanced → Visit this website**. Confirm.
3. Then in **Settings → General → About → Certificate Trust Settings**, turn on the entry for this bridge.

That's a one-time step per iPad. From then on, printing is instant.

## 5. Sunday morning flow

1. Turn on the bridge PC and printer. Wait ~30 seconds.
2. Open the kiosk. It reconnects to the bridge silently — the printer icon turns green.
3. When a family arrives:
   - Search by last name in the **Check-In** tab.
   - Tap **Check In** next to each child.
   - Two labels print: one goes on the child, tear off the parent slip and hand it to the parent.
4. At pickup: **Check Out** tab → scan or type the security code from the parent's slip → confirm.

If a parent is new, use **Register family** to add them, then check in.

## 6. Troubleshooting

- **"Bridge not found"** — check the bridge PC is on, on the same wifi, and the `npm start` window is still open.
- **"Printer offline"** — power-cycle the printer. If USB, unplug and replug. Reload the bridge tab.
- **Labels come out blank or partially** — you're using the wrong label size. DK-2205 continuous is what we're set up for.
- **iPad won't trust the cert** — repeat step 4's cert trust; make sure you're on the church wifi (not cellular).
- **Check-ins not saving** — the offline banner shows pending count; they upload automatically when connectivity returns.

Still stuck? Message a team lead through **Feedback** in the sidebar.

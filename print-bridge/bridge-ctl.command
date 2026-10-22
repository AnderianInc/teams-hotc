#!/bin/bash
# Desktop control. Double-click shows Mac buttons; also accepts
# start | stop | enable | disable | status | logs from the command line.
set -uo pipefail
LABEL="life.hotc.print-bridge"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
running() { curl -fsS --max-time 1 http://localhost:9999/status >/dev/null 2>&1; }
start() {
  loaded || launchctl bootstrap "$DOMAIN" "$PLIST"
  launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || true
  for _ in $(seq 1 10); do running && { echo "Bridge started."; return 0; }; sleep 1; done
  echo "Bridge did not start. Check the logs."; return 1
}
stop() { if loaded; then launchctl bootout "$DOMAIN/$LABEL"; fi; echo "Bridge stopped."; }
startup() { /usr/libexec/PlistBuddy -c "Set :RunAtLoad $1" "$PLIST"; }
atlogin() { /usr/libexec/PlistBuddy -c 'Print :RunAtLoad' "$PLIST" 2>/dev/null || echo false; }
status() { if running; then echo "Running"; else echo "Stopped"; fi; }

dialog() { # $1 text, $2 buttons list
  osascript -e "button returned of (display dialog \"$1\" with title \"HOTC Print Bridge\" buttons {$2} default button 1)" 2>/dev/null
}
closeterm() { osascript -e 'tell application "Terminal" to close (every window whose name contains "Bridge Control" or name contains "bridge-ctl")' >/dev/null 2>&1 & }

if [[ ! -f "$PLIST" ]]; then
  osascript -e 'display dialog "Run Install Bridge first." with title "HOTC Print Bridge" buttons {"OK"}' >/dev/null 2>&1
  echo "Run Install Bridge.command once first."; exit 1
fi

action="${1:-menu}"
if [[ "$action" != menu ]]; then
  case "$action" in
    start) start;; stop) stop;; enable) startup true;; disable) startup false;;
    status) status; echo "Start at login: $(atlogin)";;
    logs) open "$HOME/Library/Logs/HOTC Print Bridge";;
    *) echo "Use start, stop, enable, disable, status, or logs."; exit 1;;
  esac
  exit $?
fi

while true; do
  if [[ "$(atlogin)" == true ]]; then login="On"; toggle="Turn off auto-start"; else login="Off"; toggle="Turn on auto-start"; fi
  if running; then main="Stop"; else main="Start"; fi
  choice=$(dialog "Bridge: $(status)\nStart automatically at login: $login" "\"$main\", \"$toggle\", \"Close\"")
  case "$choice" in
    Start) msg=$(start); dialog "$msg" "\"OK\"" >/dev/null;;
    Stop) stop >/dev/null;;
    "Turn off auto-start") startup false;;
    "Turn on auto-start") startup true;;
    *) break;;
  esac
done
closeterm
exit 0

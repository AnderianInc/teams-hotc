#!/bin/bash
set -euo pipefail
LABEL="life.hotc.print-bridge"
DOMAIN="gui/$(id -u)"
DIR="$HOME/Library/Application Support/HOTC Print Bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
start() {
  if ! loaded; then launchctl bootstrap "$DOMAIN" "$PLIST"; fi
  launchctl kickstart "$DOMAIN/$LABEL"
  echo "Bridge started. Use Check connection in the app to check the printer."
}
stop() {
  if loaded; then launchctl bootout "$DOMAIN/$LABEL"; fi
  echo "Bridge stopped."
}
startup() {
  /usr/libexec/PlistBuddy -c "Set :RunAtLoad $1" "$PLIST"
  echo "Login startup set to $1. This does not change whether the bridge is running now."
}
status() {
  if loaded; then launchctl print "$DOMAIN/$LABEL" | grep -E 'state =|pid =|last exit code' || true; else echo "Bridge stopped."; fi
  /usr/libexec/PlistBuddy -c 'Print :RunAtLoad' "$PLIST" | sed 's/^/Start at login: /'
}
action="${1:-menu}"
if [[ ! -f "$PLIST" ]]; then echo "Run Install Bridge.command once first."; exit 1; fi
if [[ "$action" == menu ]]; then
  status
  printf '\n1) Start\n2) Stop\n3) Enable start at login\n4) Disable start at login\n5) Status\n6) Open logs\n0) Close\nChoose: '
  read -r choice
  case "$choice" in 1) action=start;; 2) action=stop;; 3) action=enable;; 4) action=disable;; 5) action=status;; 6) action=logs;; *) exit 0;; esac
  interactive=true
fi
case "$action" in
  start) start;;
  stop) stop;;
  enable) startup true;;
  disable) startup false;;
  status) status;;
  logs) open "$HOME/Library/Logs/HOTC Print Bridge";;
  *) echo "Use start, stop, enable, disable, status, or logs."; exit 1;;
esac
if [[ "${interactive:-false}" == true ]]; then read -r -p "Press Enter to close…" ignored; fi
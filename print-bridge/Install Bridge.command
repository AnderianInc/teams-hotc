#!/bin/bash
# One double-click setup. No typing; the Terminal window closes itself.
cd "$(dirname "$0")"
say() { osascript -e "display dialog \"$1\" with title \"HOTC Print Bridge\" buttons {\"OK\"} default button 1 with icon $2" >/dev/null 2>&1; }
if output=$(bash ./install-service.sh 2>&1); then
  say "Setup complete. The print bridge is running in the background and starts automatically when this Mac logs in.\n\nYou can close everything now. Use 'HOTC Bridge Control' on the Desktop to start or stop it." note
else
  echo "$output" > "$HOME/Desktop/HOTC Bridge setup error.txt"
  say "Setup did not finish. Details were saved to 'HOTC Bridge setup error.txt' on the Desktop." caution
fi
osascript -e 'tell application "Terminal" to close (every window whose name contains "Install Bridge")' >/dev/null 2>&1 &
exit 0

#!/bin/bash
set -euo pipefail
umask 077
[[ "$(uname -s)" == Darwin ]] || { echo "This installer is for macOS."; exit 1; }
SOURCE="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/Library/Application Support/HOTC Print Bridge"
LOGS="$HOME/Library/Logs/HOTC Print Bridge"
PLIST="$HOME/Library/LaunchAgents/life.hotc.print-bridge.plist"
DOMAIN="gui/$(id -u)"
mkdir -p "$DIR" "$LOGS" "$HOME/Library/LaunchAgents"

# Validate the launch target before stopping an existing installation.
if [[ -f "$SOURCE/hotc-print-bridge" ]]; then
  TARGET=binary
elif [[ -f "$SOURCE/server.js" ]]; then
  NODE="$(command -v node || true)"
  [[ -n "$NODE" ]] || { echo "Node.js is required for a source install. Use the prebuilt download instead."; exit 1; }
  [[ -d "$SOURCE/node_modules" ]] || (cd "$SOURCE" && npm install --omit=dev)
  TARGET=source
else
  echo "Missing bridge files. Extract the complete download and try again."; exit 1
fi

AUTO=true
if [[ -f "$PLIST" ]]; then AUTO=$(/usr/libexec/PlistBuddy -c 'Print :RunAtLoad' "$PLIST"); fi
if launchctl print "$DOMAIN/life.hotc.print-bridge" >/dev/null 2>&1; then
  launchctl bootout "$DOMAIN/life.hotc.print-bridge"
fi
if [[ "$SOURCE" != "$DIR" ]]; then
  if [[ "$TARGET" == binary ]]; then
    cp "$SOURCE/hotc-print-bridge" "$DIR/hotc-print-bridge"
    chmod +x "$DIR/hotc-print-bridge"
    # Repair the pkg executable's local signature, not a Gatekeeper bypass.
    codesign --force --sign - "$DIR/hotc-print-bridge"
    codesign --verify "$DIR/hotc-print-bridge"
  else
    cp "$SOURCE/server.js" "$SOURCE/package.json" "$DIR/"
    rm -rf "$DIR/node_modules"
    cp -R "$SOURCE/node_modules" "$DIR/node_modules"
  fi
  cp "$SOURCE/bridge-ctl.command" "$DIR/bridge-ctl.command"
  if [[ ! -f "$DIR/.env" && -f "$SOURCE/.env" ]]; then cp "$SOURCE/.env" "$DIR/.env"; fi
  if [[ ! -d "$DIR/cert" && -d "$SOURCE/cert" ]]; then cp -R "$SOURCE/cert" "$DIR/cert"; fi
fi
chmod +x "$DIR/bridge-ctl.command"
if [[ -d "$DIR/cert" ]]; then chmod 700 "$DIR/cert"; [[ ! -f "$DIR/cert/key.pem" ]] || chmod 600 "$DIR/cert/key.pem"; fi
export HOTC_INSTALL_DIR="$DIR" HOTC_LOG_DIR="$LOGS" HOTC_PLIST="$PLIST" HOTC_AUTO="$AUTO" HOTC_TARGET="$TARGET" HOTC_NODE="${NODE:-}"
# JXA is included with macOS; XML escaping keeps names/paths safe.
osascript -l JavaScript <<'JXA'
ObjC.import('Foundation');
const env = $.NSProcessInfo.processInfo.environment;
const get = k => ObjC.unwrap(env.objectForKey(k));
const dir = get('HOTC_INSTALL_DIR');
const args = get('HOTC_TARGET') === 'binary' ? [dir + '/hotc-print-bridge'] : [get('HOTC_NODE'), dir + '/server.js'];
const config = {
  Label: 'life.hotc.print-bridge', ProgramArguments: args,
  WorkingDirectory: dir, RunAtLoad: get('HOTC_AUTO') === 'true', KeepAlive: { SuccessfulExit: false }, ThrottleInterval: 10,
  EnvironmentVariables: { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', CERT_DIR: dir + '/cert' },
  StandardOutPath: get('HOTC_LOG_DIR') + '/bridge.log', StandardErrorPath: get('HOTC_LOG_DIR') + '/error.log'
};
const data = $.NSPropertyListSerialization.dataWithPropertyListFormatOptionsError($(config), $.NSPropertyListXMLFormat_v1_0, 0, null);
if (!data || !data.writeToFileAtomically($(get('HOTC_PLIST')), true)) throw new Error('Unable to save login settings');
JXA
mkdir -p "$HOME/Desktop"
cp "$DIR/bridge-ctl.command" "$HOME/Desktop/HOTC Bridge Control.command"
"$DIR/bridge-ctl.command" start >/dev/null
# Confirm the bridge actually answers before reporting success.
for _ in $(seq 1 15); do
  if curl -fsS --max-time 1 http://localhost:9999/status >/dev/null 2>&1; then
    echo "Installed and running."; exit 0
  fi
  sleep 1
done
echo "The bridge did not start. Open Desktop → HOTC Bridge Control → Logs for details."; exit 1
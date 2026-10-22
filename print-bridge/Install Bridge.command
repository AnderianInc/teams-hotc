#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if bash ./install-service.sh; then
  read -r -p "Start the bridge automatically whenever you log in? (y/N): " answer
  if [[ "$answer" == y || "$answer" == Y ]]; then
    "$HOME/Library/Application Support/HOTC Print Bridge/bridge-ctl.command" enable
  fi
else
  echo "Setup failed. Read the message above; the bridge was not confirmed running."
fi
read -r -p "Press Enter to close…" ignored
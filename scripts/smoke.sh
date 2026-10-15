#!/usr/bin/env bash
# Runs the real-backend self-test against a built binary.
# Usage: scripts/smoke.sh [path-to-binary]
set -euo pipefail
BIN="${1:-src-tauri/target/release/biblozen}"
WORK="$(mktemp -d)"
mkdir -p "$WORK/folder" "$WORK/config"
XDG_CONFIG_HOME="$WORK/config" BIBLOZEN_SMOKE_DIR="$WORK/folder" timeout 60 "$BIN" >"$WORK/log.txt" 2>&1 || true
if [[ ! -f "$WORK/folder/smoke-report.json" ]]; then
  echo "smoke: no report produced"; tail -20 "$WORK/log.txt"; exit 1
fi
cat "$WORK/folder/smoke-report.json"
grep -q '"ok": true' "$WORK/folder/smoke-report.json"

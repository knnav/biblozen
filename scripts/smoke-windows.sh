#!/usr/bin/env bash
# WSL only: cross-compiles the Windows exe and runs the self-test on the Windows host.
# Note: the trash step leaves one small "moved copy.md" in the Windows Recycle Bin.
set -euo pipefail
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle >/dev/null
WIN_TEMP="$(wslpath "$(cmd.exe /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")"
WORK="$WIN_TEMP/biblozen-smoke-$$"
mkdir -p "$WORK/folder"
cp src-tauri/target/x86_64-pc-windows-msvc/release/biblozen.exe "$WORK/Biblozen.exe"
(cd "$WORK" && BIBLOZEN_SMOKE_DIR="$WORK/folder" WSLENV="BIBLOZEN_SMOKE_DIR/p" timeout 60 ./Biblozen.exe) || true
# WSL's timeout doesn't reach the Windows process; stop this test's instance (only
# the exe in $WORK) so it can't hold the single-instance lock.
WORK_WIN="$(wslpath -w "$WORK")"
powershell.exe -NoProfile -Command "Get-Process Biblozen -ErrorAction SilentlyContinue | Where-Object { \$_.Path -like '${WORK_WIN}*' } | Stop-Process -Force" >/dev/null 2>&1 || true
if [[ ! -f "$WORK/folder/smoke-report.json" ]]; then
  echo "smoke: no report; last step: $(cat "$WORK/folder/smoke-progress.txt" 2>/dev/null)"
  exit 1
fi
REPORT="$(cat "$WORK/folder/smoke-report.json")"
rm -rf "$WORK"
echo "$REPORT"
grep -q '"ok": true' <<<"$REPORT"

#!/usr/bin/env bash
# WSL only: CLI args + single-instance forwarding + routing on the Windows host.
set -euo pipefail
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle >/dev/null
WIN_TEMP="$(wslpath "$(cmd.exe /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")"
W="$WIN_TEMP/biblozen-multi-$$"
mkdir -p "$W/A" "$W/B"
printf '# X\n' > "$W/A/x.md"
cp src-tauri/target/x86_64-pc-windows-msvc/release/biblozen.exe "$W/Biblozen.exe"
SESSION="$W/data/session.json"
win() { wslpath -w "$1"; }
stop() {
  powershell.exe -NoProfile -Command "Get-Process Biblozen -ErrorAction SilentlyContinue | Where-Object { \$_.Path -like '$(win "$W")*' } | Stop-Process -Force" >/dev/null 2>&1 || true
}
trap stop EXIT
wait_for() {
  for _ in $(seq 1 80); do
    if [[ -f "$SESSION" ]] && grep -q "$2" "$SESSION"; then echo "ok: $1"; return 0; fi
    sleep 0.25
  done
  echo "FAIL: $1"; cat "$SESSION" 2>/dev/null; exit 1
}
(cd "$W" && ./Biblozen.exe "$(win "$W/A")" >/dev/null 2>&1 &)
wait_for "first launch opens A" '\\\\A"'
(cd "$W" && timeout 20 ./Biblozen.exe "$(win "$W/a/X.MD")" >/dev/null 2>&1) || true
wait_for "second launch (different case) opens x.md in A's window" 'x.md\|X.MD'
(cd "$W" && timeout 20 ./Biblozen.exe "$(win "$W/B")" >/dev/null 2>&1) || true
wait_for "B opens in a second window" '\\\\B"'
python3 -c "import json,sys; n=len(json.load(open(sys.argv[1]))['windows']); assert n == 2, n; print('ok: two windows')" "$SESSION"
stop
rm -rf "$W"
echo "multiwindow-windows: all checks passed"

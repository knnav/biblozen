#!/usr/bin/env bash
# Real-app check of CLI args, single-instance forwarding, routing and session
# restore (Linux). Usage: scripts/multiwindow.sh [binary]
set -euo pipefail
BIN="${1:-$PWD/src-tauri/target/release/biblozen}"
W="$(mktemp -d)"
export XDG_CONFIG_HOME="$W/config"
mkdir -p "$W/A/sub" "$W/B"
printf '# X\n' > "$W/A/x.md"
printf '# Y\n' > "$W/A/sub/y.md"
printf '# Z\n' > "$W/B/z.md"
SESSION="$XDG_CONFIG_HOME/Biblozen/session.json"
wait_for() { # wait_for <description> <grep pattern…>
  local what="$1"; shift
  for _ in $(seq 1 80); do
    if [[ -f "$SESSION" ]] && "$@" "$SESSION" >/dev/null 2>&1; then echo "ok: $what"; return 0; fi
    sleep 0.25
  done
  echo "FAIL: $what"; cat "$SESSION" 2>/dev/null; return 1
}
count_windows() { python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['windows']))" "$SESSION"; }

"$BIN" "$W/A" >"$W/log1.txt" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
wait_for "first launch opens folder A from the CLI" grep -q "\"$W/A\""

# Second launch with a file inside A: forwarded to the running instance, which
# focuses A's window and opens the file (no new window).
timeout 20 "$BIN" "$W/A/x.md" >"$W/log2.txt" 2>&1
echo "ok: second launch exited (forwarded)"
wait_for "file inside A opened in A's window" grep -q "x.md"
[[ "$(count_windows)" == 1 ]] && echo "ok: still one window" || { echo "FAIL: expected 1 window"; cat "$SESSION"; exit 1; }

# A different folder → a new window.
timeout 20 "$BIN" "$W/B" >/dev/null 2>&1
wait_for "folder B opened in a second window" grep -q "\"$W/B\""
[[ "$(count_windows)" == 2 ]] && echo "ok: two windows" || { echo "FAIL: expected 2 windows"; exit 1; }

# Quit and relaunch with no args → both windows restored.
kill "$PID"; wait "$PID" 2>/dev/null || true
cp "$SESSION" "$W/session-before.json"
"$BIN" >"$W/log3.txt" 2>&1 &
PID=$!
sleep 4
python3 - "$W/session-before.json" "$SESSION" <<'PY'
import json, sys
before = {w["root"] for w in json.load(open(sys.argv[1]))["windows"]}
after = {w["root"] for w in json.load(open(sys.argv[2]))["windows"]}
assert before == after, (before, after)
print("ok: session restored", sorted(after))
PY
echo "multiwindow: all checks passed"

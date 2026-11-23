#!/bin/bash
# v0.3 lots: real browser-profile upgrade from schema 4 to 5 (see chain.spec.ts).
#
# Usage (Git Bash on Windows, or any bash with PowerShell available):
#   WT_V02=<built checkout of feat/v0.2-integration, c922234> CHAIN_OUT=<empty dir> \
#   bash tests/upgrade-chain/run-v03.sh
# WT_V02 must already have `npm ci` and `npm run build` done, and so must this
# checkout. Servers are stopped by port, because Git Bash `kill` leaves the
# Windows node child of `next start` running on port 3000.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${CHAIN_OUT:?set CHAIN_OUT}"
mkdir -p "$OUT"
PROFILE="$OUT/profile"
rm -rf "$PROFILE" "$OUT"/profile-restore*

stop_port() {
  powershell.exe -NoProfile -Command \
    "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" \
    > /dev/null 2>&1
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "http://localhost:3000/" || return 0
    sleep 1
  done
  echo "port 3000 still answering after stop" >&2
  return 1
}

serve() {
  local dir="$1" name="$2"
  stop_port || exit 1
  (cd "$dir" && npx next start -p 3000 > "$OUT/server-$name.log" 2>&1 &)
  for _ in $(seq 1 60); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)" = "200" ]; then
      echo "[$name] serving $(git -C "$dir" rev-parse HEAD) from $dir"
      return 0
    fi
    sleep 1
  done
  echo "[$name] server did not start" >&2
  exit 1
}

phase() {
  local name="$1" profile="$2"
  (cd "$REPO" && PHASE="$name" CHAIN_PROFILE="$profile" CHAIN_OUT="$OUT" \
    npx playwright test -c tests/upgrade-chain/playwright.config.ts > "$OUT/phase-$name.log" 2>&1)
  local rc=$?
  echo "[$name] exit $rc: $(grep -E '^\s+[0-9]+ (passed|failed|skipped)' "$OUT/phase-$name.log" | tr -s ' ' | tr '\n' ' ')"
  [ $rc -eq 0 ] || { stop_port; exit $rc; }
}

serve "${WT_V02:?}" v02; phase v02 "$PROFILE"
serve "$REPO" lots;      phase lots "$PROFILE"
phase restore04v02 "$OUT/profile-restore04v02"
phase restore05 "$OUT/profile-restore05"
stop_port
echo "v0.3 upgrade check complete"

#!/usr/bin/env bash
# Launch online-rummy with a Cloudflare tunnel.
# Prerequisites: pnpm, cloudflared, tmux, node >= 22.13

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT_DIR="$PWD"

SESSION="online-rummy"
PRINT_URL_SCRIPT=$(mktemp /tmp/print_url_XXXX.sh)
trap 'rm -f "$PRINT_URL_SCRIPT"' EXIT

cat > "$PRINT_URL_SCRIPT" << 'EOF'
#!/usr/bin/env bash
printf '\n'
printf '╔══════════════════════════════════════════════════════════════════════════╗\n'
printf '║  Share this URL with players:                                            ║\n'
printf '║  %-72s║\n' "$1"
printf '╚══════════════════════════════════════════════════════════════════════════╝\n'
EOF
chmod +x "$PRINT_URL_SCRIPT"

print_url() { bash "$PRINT_URL_SCRIPT" "$1"; }

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo "==> Installing and building..."
pnpm install
echo "==> ... installed."
pnpm --filter @online-rummy/shared build
pnpm --filter @online-rummy/server build
pnpm --filter @online-rummy/client build
echo "==> ... built."

# ── 2. Start tunnel in a tmux pane ───────────────────────────────────────────
echo -e "\n==> Launching Cloudflare tunnel..."
tmux kill-session -t "$SESSION" 2>/dev/null || true

CF_LOG=$(mktemp /tmp/cloudflared_XXXX.log)
trap 'rm -f "$PRINT_URL_SCRIPT" "$CF_LOG"' EXIT

PANE0=$(tmux new-session -d -s "$SESSION" -x 220 -y 55 -P -F "#{pane_id}")
PANE1=$(tmux split-window -h -t "$PANE0" -P -F "#{pane_id}")

tmux send-keys -t "$PANE0" "cloudflared tunnel --url http://localhost:8080 2>&1 | tee '$CF_LOG'" Enter

# ── 3. Wait for tunnel URL by polling the log file ───────────────────────────
TUNNEL_URL=""
printf "  Waiting for tunnel" >&2
i=0
while (( i++ < 120 )); do
  sleep 1
  u=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1 || true)
  if [[ -n "$u" ]]; then
    TUNNEL_URL="$u"
    echo " -> $TUNNEL_URL" >&2
    break
  fi
  printf '.' >&2
done
if [[ -z "$TUNNEL_URL" ]]; then
  echo " TIMED OUT" >&2
  echo "cloudflared output:" >&2
  cat "$CF_LOG" >&2
  exit 1
fi

# ── 4. Generate session secret ────────────────────────────────────────────────
SESSION_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")

# ── 5. Start server ───────────────────────────────────────────────────────────
echo -e "\n==> Starting server..."
tmux send-keys -t "$PANE1" \
  "cd '$ROOT_DIR' && bash '$PRINT_URL_SCRIPT' '$TUNNEL_URL' && SESSION_SECRET='$SESSION_SECRET' ALLOWED_ORIGINS='$TUNNEL_URL' node packages/server/dist/index.js" Enter

tmux select-layout -t "$SESSION:0" even-horizontal

# ── 6. Print player URL and attach ───────────────────────────────────────────
print_url "$TUNNEL_URL"
printf '\nAttaching to tmux session "%s"\n' "$SESSION"
printf 'Press Ctrl+B then D to detach and keep the server running in the background.\n'
printf 'tmux kill-session -t online-rummy to stop the server.\n\n'
sleep 5
tmux attach-session -t "$SESSION"

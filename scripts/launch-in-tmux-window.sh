#!/usr/bin/env bash
# Launch online-rummy with Cloudflare tunnels.
# Prerequisites: pnpm, cloudflared, tmux, node >= 22.13

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT_DIR="$PWD"

SESSION="online-rummy"
CF_SERVER_LOG=$(mktemp /tmp/cf_server_XXXX.log)
CF_CLIENT_LOG=$(mktemp /tmp/cf_client_XXXX.log)
PRINT_URL_SCRIPT=$(mktemp /tmp/print_url_XXXX.sh)
trap 'rm -f "$CF_SERVER_LOG" "$CF_CLIENT_LOG" "$PRINT_URL_SCRIPT"' EXIT

# Write print_url to a file so UTF-8 box chars survive tmux send-keys intact
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
echo "==> ... built."

# ── 2. Start tunnels in tmux panes, tee output to log files ──────────────────
echo -e "\n==> Launching Cloudflare tunnels..."
tmux kill-session -t "$SESSION" 2>/dev/null || true

PANE0=$(tmux new-session -d -s "$SESSION" -x 220 -y 55 -P -F "#{pane_id}")
PANE1=$(tmux split-window -h -t "$PANE0" -P -F "#{pane_id}")

# server tunnel
tmux send-keys -t "$PANE0" \
  "cloudflared tunnel --url http://localhost:8080 2>&1 | tee '$CF_SERVER_LOG'" Enter

# client tunnel
tmux send-keys -t "$PANE1" \
  "cloudflared tunnel --url http://localhost:4173 2>&1 | tee '$CF_CLIENT_LOG'" Enter

# Poll a log file until a trycloudflare.com URL appears (up to 90s)
wait_url() {
  local f=$1 label=$2
  printf "  Waiting for %s tunnel" "$label" >&2
  local i=0
  while (( i++ < 90 )); do
    local u
    u=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$f" 2>/dev/null | head -1)
    if [[ -n "$u" ]]; then
      echo " -> $u" >&2
      echo "$u"
      return
    fi
    printf '.' >&2
    sleep 1
  done
  echo " TIMED OUT" >&2
  exit 1
}

SERVER_TUNNEL=$(wait_url "$CF_SERVER_LOG" "server")
CLIENT_TUNNEL=$(wait_url "$CF_CLIENT_LOG" "client")

# ── 3. Build client with WS URL baked in ─────────────────────────────────────
SERVER_WSS="${SERVER_TUNNEL/https:/wss:}"
echo -e "\n==> Building client (VITE_WS_URL=$SERVER_WSS)..."
VITE_WS_URL="$SERVER_WSS" pnpm --filter @online-rummy/client build
echo "==> ... built."

# ── 4. Generate random session secret ────────────────────────────────────────
SESSION_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")

# ── 5. Start server + static file server in remaining panes ──────────────────
echo -e "\n==> Starting server and static file server..."

PANE2=$(tmux split-window -v -t "$PANE0" -P -F "#{pane_id}")
tmux send-keys -t "$PANE2" \
  "cd '$ROOT_DIR' && bash '$PRINT_URL_SCRIPT' '$CLIENT_TUNNEL' && SESSION_SECRET='$SESSION_SECRET' ALLOWED_ORIGINS='$CLIENT_TUNNEL' node packages/server/dist/index.js" Enter

PANE3=$(tmux split-window -v -t "$PANE1" -P -F "#{pane_id}")
tmux send-keys -t "$PANE3" \
  "cd '$ROOT_DIR' && pnpm dlx serve packages/client/dist -l 4173" Enter

tmux select-layout -t "$SESSION:0" tiled

# ── 6. Print player URL and attach ───────────────────────────────────────────
print_url "$CLIENT_TUNNEL"
printf '\nAttaching to tmux session "%s"\n' "$SESSION"
printf 'Press Ctrl+B then D to detach and keep the server running in the background.\n'
printf 'tmux kill-session -t online-rummy to stop the server.\n\n'
sleep 5
tmux attach-session -t "$SESSION"

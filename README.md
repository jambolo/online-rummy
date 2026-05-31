# Rum Runner: The Ultimate Rummy Club

[![CI](https://github.com/jambolo/online-rummy/actions/workflows/ci.yml/badge.svg)](https://github.com/jambolo/online-rummy/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/jambolo/online-rummy/graph/badge.svg)](https://codecov.io/gh/jambolo/online-rummy)

Browser-based multiplayer rummy supporting three variants: **Classic Rummy**, **Gin Rummy**, and **500 Rummy**. No accounts — pick a nickname, create a room, share the code, play.

---

## Variants

### Classic Rummy

2–7 players. Form sets (3–4 cards of the same rank) and runs (3+ consecutive cards of the same suit). Go out by melding, laying off, and discarding your last card. Ace is low (A-2-3 valid; Q-K-A invalid). Going out without having melded before earns double score. First player to accumulate 100 points wins.

### Gin Rummy

2 players. Build your hand privately — no open melding until you knock. Knock when your unmatched (deadwood) cards total 10 points or fewer. Gin (zero deadwood) earns a 20-point bonus plus your opponent's unmatched total. Undercut earns your opponent 10 points plus the difference. Box bonus of 20 per hand won; first to 100 cumulative points wins with a 100-point game bonus.

### 500 Rummy

2–8 players. Melds score positive points; cards left in hand score negative. Pick any card from the discard pile — you must take everything above it and immediately play the selected card. Lay off cards onto other players' melds and take the credit yourself. Ace counts as 15 (or 1 in an A-2-3 run). First player to cross 500 cumulative points wins.

---

## Running the Server

### Prerequisites

- [Node.js](https://nodejs.org/) 22.13 or newer
- [pnpm](https://pnpm.io/) 11 or newer

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | HMAC signing key for session tokens (delivered in the lobby broadcast, not HTTP cookies). Minimum 32 characters. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of browser origins allowed to connect (e.g. `https://yourdomain.com`). |
| `PORT` | No | Port to listen on. Defaults to `8080`. |

`SESSION_SECRET` and `ALLOWED_ORIGINS` must be set before starting. The server refuses to boot without them.

### Build and start

```sh
pnpm install
pnpm build

SESSION_SECRET=<your-secret-min-32-chars> \
ALLOWED_ORIGINS=http://localhost:5173 \
node packages/server/dist/index.js
```

On Windows (PowerShell):

```powershell
$env:SESSION_SECRET = "<your-secret-min-32-chars>"
$env:ALLOWED_ORIGINS = "http://localhost:5173"
node packages/server/dist/index.js
```

### Connecting

After `pnpm build`, the server serves the built client bundle (`packages/client/dist`) on the same port as the WebSocket endpoint — open `http://localhost:8080` in your browser. Override the bundle location with `STATIC_DIR`. If no bundle is found, HTTP requests return `404` and the server runs WebSocket-only.

For client development with hot reload, run the dev server instead:

```sh
pnpm --filter @online-rummy/client dev
```

The client derives its WebSocket URL from the page origin: `wss://<host>` when served over HTTPS, otherwise `ws://<hostname>:8080`. Override with the `VITE_WS_URL` build-time env var.

---

## How to Play

1. Open the app in your browser and enter a nickname.
2. **Create a room** — choose a variant and share the 5-character room code with your friends.
3. **Join a room** — enter the room code you received.
4. The room host starts the game once enough players have joined.
5. Play proceeds in turn order. On your turn: draw a card, optionally meld or lay off, then discard.

Games are ephemeral — no accounts, no saved history. If you close the browser mid-game your hand is forfeited.

---

## Self-Hosting Notes

- The server serves the built client bundle and the WebSocket endpoint on the same port, so a single origin (and a single tunnel) covers the whole app. If the bundle is absent, HTTP requests return `404` and only the WebSocket endpoint is live. Override the bundle path with `STATIC_DIR`.
- For HTTPS/WSS without opening inbound ports, use a Cloudflare Tunnel for automatic TLS (see [Hosting on Cloudflare](#hosting-on-cloudflare)). The client auto-selects `wss://` when served over HTTPS, so no rebuild is needed.
- The server keeps all game state in memory. Restarting the process ends all active games.

---

## Hosting on Cloudflare

To play with a remote friend without a permanent server, expose your local server through a single [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-tunnel/). This gives free TLS (`wss://`) with no account and a temporary URL. Your machine must stay on for the duration of the game.

Because the server serves the built client on the same port as the WebSocket endpoint, **one tunnel covers both** — no separate client tunnel or rebuild is needed.

Install `cloudflared` once (Windows):

```bash
winget install --id Cloudflare.cloudflared
```

1. Build everything (produces `packages/client/dist`, which the server serves):

   ```bash
   pnpm install
   pnpm build
   ```

2. Start the tunnel and note the `https://*.trycloudflare.com` URL it prints. The server need not be running yet — the URL is assigned when the tunnel starts.

   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```

3. Start the server, allowing the tunnel origin (exact match, no trailing slash):

   ```bash
   export SESSION_SECRET="<your-secret-min-32-chars>"
   export ALLOWED_ORIGINS="https://<your-tunnel-host>.trycloudflare.com"
   node packages/server/dist/index.js
   ```

4. Send your friend the tunnel URL. They open it in a browser, create a room, and share the code. The client auto-connects over `wss://` to the same origin.

**Note:** quick-tunnel URLs change on every restart. After restarting the tunnel, update `ALLOWED_ORIGINS` to the new URL and restart the server. No client rebuild is required.

**Tip:** `scripts/launch-in-tmux-window.sh` automates steps 1–3 (build, start tunnel, generate a `SESSION_SECRET`, start the server) and prints the shareable URL.

---

## License

[MIT](LICENSE)

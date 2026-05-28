# Rum Runner: The Ultimate Rummy Club

[![CI](https://github.com/jambolo/online-rummy/actions/workflows/ci.yml/badge.svg)](https://github.com/jambolo/online-rummy/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/jambolo/online-rummy/graph/badge.svg)](https://codecov.io/gh/jambolo/online-rummy)

Browser-based multiplayer rummy supporting three variants: **Classic Rummy**, **Gin Rummy**, and **500 Rum**. No accounts — pick a nickname, create a room, share the code, play.

---

## Variants

### Classic Rummy

2–6 players. Form sets (3–4 cards of the same rank) and runs (3+ consecutive cards of the same suit). Go out by melding, laying off, and discarding your last card. Ace is low (A-2-3 valid; Q-K-A invalid). At most one meld per turn. Going out without having melded before earns double score. First player to accumulate 100 points wins.

### Gin Rummy

2 players. Build your hand privately — no open melding until you knock. Knock when your unmatched (deadwood) cards total 10 points or fewer. Gin (zero deadwood) earns a 20-point bonus plus your opponent's unmatched total. Undercut earns your opponent 10 points plus the difference. Box bonus of 20 per hand won; first to 100 cumulative points wins with a 100-point game bonus.

### 500 Rum

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

### With Docker (recommended)

```sh
docker build -t online-rummy .

docker run -d \
  -p 8080:8080 \
  -e SESSION_SECRET=<your-secret-min-32-chars> \
  -e ALLOWED_ORIGINS=http://localhost:5173 \
  online-rummy
```

### Without Docker

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

The server itself only handles WebSocket connections. Run the client separately and open it in your browser:

```sh
pnpm --filter @online-rummy/client dev
```

By default the client connects to `ws://<hostname>:8080`; override with the `VITE_WS_URL` env var.

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

- The server exposes only the WebSocket endpoint (plain HTTP requests return `404`). The client is a separate static bundle built with `pnpm --filter @online-rummy/client build`; serve it yourself and point it at the server via the `VITE_WS_URL` build-time variable.
- For HTTPS/WSS in production, place a reverse proxy (nginx, Caddy) in front of the server and terminate TLS there, or use a Cloudflare Tunnel for automatic TLS without opening inbound ports (see [Hosting on Cloudflare](#hosting-on-cloudflare)).
- The server keeps all game state in memory. Restarting the process ends all active games.

---

## Hosting on Cloudflare

To play with a remote friend without a permanent server, expose your two local processes (WebSocket server and client) through [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-tunnel/). This gives free TLS (`wss://`) with no account and temporary URLs. Your machine must stay on for the duration of the game.

Install `cloudflared` once (Windows):

```bash
winget install --id Cloudflare.cloudflared
```

1. Build everything:

   ```bash
   pnpm install
   pnpm build
   ```

2. Start both tunnels and note each `https://*.trycloudflare.com` URL printed. The backends need not be running yet — the URL is assigned when the tunnel starts.

   ```bash
   # Terminal A — server (WebSocket). URL -> SERVER_URL
   cloudflared tunnel --url http://localhost:8080

   # Terminal B — client. URL -> CLIENT_URL
   cloudflared tunnel --url http://localhost:4173
   ```

3. Build the client pointing at the server tunnel. `VITE_WS_URL` is baked in at build time; swap `https` for `wss`:

   ```bash
   export VITE_WS_URL="wss://<SERVER_URL-host>.trycloudflare.com"
   pnpm --filter @online-rummy/client build
   ```

4. Start the server, allowing the client tunnel origin (exact match, no trailing slash):

   ```bash
   export SESSION_SECRET="<your-secret-min-32-chars>"
   export ALLOWED_ORIGINS="https://<CLIENT_URL-host>.trycloudflare.com"
   node packages/server/dist/index.js
   ```

5. Serve the built client on port 4173 with a static server (`vite preview` rejects the tunnel's `Host` header):

   ```bash
   pnpm dlx serve packages/client/dist -l 4173
   ```

6. Send your friend the `CLIENT_URL`. Create a room and share the code.

**Note:** quick-tunnel URLs change on every restart. If you restart the server tunnel, rebuild the client (step 3) with the new `wss://` URL. If you restart the client tunnel, update `ALLOWED_ORIGINS` and restart the server.

---

## License

[MIT](LICENSE)

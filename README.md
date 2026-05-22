# Online Rummy

Browser-based multiplayer rummy supporting three variants: **Basic Rummy**, **Gin Rummy**, and **500 Rum**. No accounts — pick a nickname, create a room, share the code, play.

---

## Variants

### Basic Rummy

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
| `SESSION_SECRET` | Yes | HMAC signing key for session cookies. Minimum 32 characters. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of browser origins allowed to connect (e.g. `https://yourdomain.com`). |
| `PORT` | No | Port to listen on. Defaults to `8080`. |
| `NODE_ENV` | No | Set to `production` to enable `Secure` and `SameSite=Strict` cookie flags. |
| `LOG_LEVEL` | No | Logging verbosity (`trace`, `debug`, `info`, `warn`, `error`). Defaults to `info`. |

`SESSION_SECRET` and `ALLOWED_ORIGINS` must be set before starting. The server refuses to boot without them.

### With Docker (recommended)

```sh
docker build -t online-rummy .

docker run -d \
  -p 8080:8080 \
  -e SESSION_SECRET=<your-secret-min-32-chars> \
  -e ALLOWED_ORIGINS=http://localhost:8080 \
  online-rummy
```

### Without Docker

```sh
pnpm install
pnpm build

SESSION_SECRET=<your-secret-min-32-chars> \
ALLOWED_ORIGINS=http://localhost:8080 \
node packages/server/dist/index.js
```

On Windows (PowerShell):

```powershell
$env:SESSION_SECRET = "<your-secret-min-32-chars>"
$env:ALLOWED_ORIGINS = "http://localhost:8080"
node packages/server/dist/index.js
```

### Connecting

Open your browser and navigate to the server's address (e.g. `http://localhost:8080`). No installation required on the client side — the server serves the web app directly.

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

- The server serves both the WebSocket endpoint and the static client bundle on the same port.
- For HTTPS/WSS in production, place a reverse proxy (nginx, Caddy) in front and terminate TLS there, or use a Cloudflare Tunnel for automatic TLS without opening inbound ports.
- The server keeps all game state in memory. Restarting the process ends all active games.

---

## License

[MIT](LICENSE)

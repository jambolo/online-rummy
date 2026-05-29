import type { C2S, S2C } from "@online-rummy/shared";

export interface WsCallbacks {
  onConnect(): void;
  onDisconnect(): void;
  onMessage(msg: S2C): void;
}

let socket: WebSocket | null = null;
let _url = "";
let _cb: WsCallbacks | null = null;
// Incremented on each new connection attempt or disconnect so stale async
// events from a previous socket (e.g. React StrictMode double-mount) are ignored.
let epoch = 0;

// Keep-alive: Cloudflare drops idle WS connections, and the other players use our
// frames as a liveness signal (silent-drop detection). Emit a keepalive whenever we
// haven't *sent* anything for KEEPALIVE_IDLE_MS. Keyed off last-sent, NOT last-received
// on purpose: if an incoming frame reset the timer, a player who only receives (the
// opponent's relayed keepalives, state broadcasts on the opponent's turn, or an idle
// lobby) would never emit, and the opponent would falsely flag them as disconnected.
const KEEPALIVE_IDLE_MS = 30_000;
const KEEPALIVE_CHECK_MS = 5_000;
let lastSent = 0;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function markSent(): void {
  lastSent = Date.now();
}

function startKeepAlive(): void {
  stopKeepAlive();
  markSent();
  keepAliveTimer = setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastSent >= KEEPALIVE_IDLE_MS) send({ t: "keepalive" });
  }, KEEPALIVE_CHECK_MS);
}

function stopKeepAlive(): void {
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

export function connect(url: string, cb: WsCallbacks): void {
  if (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }
  _url = url;
  _cb = cb;
  _open();
}

function _open(): void {
  const cb = _cb;
  if (!cb) return;

  const myEpoch = ++epoch;
  const ws = new WebSocket(_url);
  socket = ws;

  ws.onopen = () => {
    if (epoch !== myEpoch) return;
    startKeepAlive();
    cb.onConnect();
  };

  ws.onclose = () => {
    if (epoch !== myEpoch) return;
    stopKeepAlive();
    socket = null;
    cb.onDisconnect();
  };

  ws.onerror = () => {
    if (epoch !== myEpoch) return;
    stopKeepAlive();
    socket = null;
    cb.onDisconnect();
  };

  ws.onmessage = (ev: MessageEvent<string>) => {
    if (epoch !== myEpoch) return;
    let msg: S2C;
    try {
      msg = JSON.parse(ev.data) as S2C;
    } catch {
      return; // ignore malformed frames
    }
    // Keepalive frames are relayed liveness pings; forwarded so the store can record
    // per-player last-seen (used to detect a silently-dropped opponent).
    cb.onMessage(msg);
  };
}

export function send(msg: C2S): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
    markSent();
  }
}

export function disconnect(): void {
  epoch++; // invalidate all in-flight socket events
  stopKeepAlive();
  _cb = null;
  socket?.close();
  socket = null;
}

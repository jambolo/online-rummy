import type { C2S, S2C } from '@online-rummy/shared';

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface WsCallbacks {
  onStatus(status: ConnStatus): void;
  onMessage(msg: S2C): void;
}

let socket: WebSocket | null = null;
let _url = '';
let _cb: WsCallbacks | null = null;
// Incremented on each new connection attempt or disconnect so stale async
// events from a previous socket (e.g. React StrictMode double-mount, or the
// onerror+onclose pair fired for a single drop) are ignored.
let epoch = 0;

// Auto-reconnect with capped exponential backoff. A mid-game socket drop is handled
// server-side by a grace window (join+sessionId rebinds the same hand); these delays
// keep retrying through that window before giving up. `manualClose` suppresses reconnect
// when the app intentionally tears the socket down.
const BACKOFFS_MS = [500, 1000, 2000, 4000, 8000, 15000];
const MAX_RECONNECT_ATTEMPTS = 8; // ~60s total, matching the server grace window
let manualClose = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (Date.now() - lastSent >= KEEPALIVE_IDLE_MS) send({ t: 'keepalive' });
  }, KEEPALIVE_CHECK_MS);
}

function stopKeepAlive(): void {
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

export function connect(url: string, cb: WsCallbacks): void {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
    return;
  }
  _url = url;
  _cb = cb;
  manualClose = false;
  reconnectAttempt = 0;
  cb.onStatus('connecting');
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
    reconnectAttempt = 0;
    startKeepAlive();
    cb.onStatus('connected');
  };

  ws.onclose = () => {
    if (epoch !== myEpoch) return;
    handleDrop(cb);
  };

  ws.onerror = () => {
    if (epoch !== myEpoch) return;
    handleDrop(cb);
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

// A socket dropped. Bumping the epoch invalidates the sibling event (onerror+onclose
// both fire for one drop) so reconnect is scheduled exactly once.
function handleDrop(cb: WsCallbacks): void {
  epoch++;
  stopKeepAlive();
  socket = null;
  if (manualClose || !_cb) return;
  scheduleReconnect(cb);
}

function scheduleReconnect(cb: WsCallbacks): void {
  if (reconnectTimer !== null) return;
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    cb.onStatus('disconnected'); // gave up — the UI offers a manual reload
    return;
  }
  const delay = BACKOFFS_MS[Math.min(reconnectAttempt, BACKOFFS_MS.length - 1)] ?? 15000;
  reconnectAttempt++;
  cb.onStatus('reconnecting');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    _open();
  }, delay);
}

export function send(msg: C2S): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
    markSent();
  }
}

export function disconnect(): void {
  manualClose = true;
  epoch++; // invalidate all in-flight socket events
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopKeepAlive();
  _cb = null;
  socket?.close();
  socket = null;
}

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
    cb.onConnect();
  };

  ws.onclose = () => {
    if (epoch !== myEpoch) return;
    socket = null;
    cb.onDisconnect();
  };

  ws.onerror = () => {
    if (epoch !== myEpoch) return;
    socket = null;
    cb.onDisconnect();
  };

  ws.onmessage = (ev: MessageEvent<string>) => {
    if (epoch !== myEpoch) return;
    try {
      cb.onMessage(JSON.parse(ev.data) as S2C);
    } catch {
      // ignore malformed frames
    }
  };
}

export function send(msg: C2S): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function disconnect(): void {
  epoch++; // invalidate all in-flight socket events
  _cb = null;
  socket?.close();
  socket = null;
}

import { useEffect } from 'react';
import { connect, disconnect } from './net/ws';
import { useAppStore } from './store';
import Home from './routes/Home';
import Room from './routes/Room';

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (window.location.protocol === 'https:' ? `wss://${window.location.hostname}` : `ws://${window.location.hostname}:8080`);

export default function App() {
  const setConnStatus = useAppStore((s) => s.setConnStatus);
  const handleMessage = useAppStore((s) => s.handleMessage);
  const checkDisconnects = useAppStore((s) => s.checkDisconnects);
  const roomCode = useAppStore((s) => s.roomCode);

  useEffect(() => {
    connect(WS_URL, {
      onStatus: (status) => {
        setConnStatus(status);
        if (status !== 'connected') return;
        // On every (re)connect, rebind to the room if we have stored credentials. Mid-game
        // the server resumes the same hand within its grace window; otherwise it's a normal
        // lobby reconnect. Routed through the store's send so pendingName is set — that lets
        // the lobby payload resolve "me" even after a full page reload.
        const store = useAppStore.getState();
        const sid = sessionStorage.getItem('sessionId') ?? store.sessionId ?? undefined;
        const rc = sessionStorage.getItem('roomCode');
        const playerName = sessionStorage.getItem('playerName');
        if (sid && rc && playerName) {
          store.send({ t: 'join', roomCode: rc, name: playerName, sessionId: sid });
        }
      },
      onMessage: handleMessage,
    });

    return () => disconnect();
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodically check whether any other player has gone silent past the threshold.
  useEffect(() => {
    const id = setInterval(checkDisconnects, 30_000);
    return () => clearInterval(id);
  }, [checkDisconnects]);

  return roomCode !== null ? <Room /> : <Home />;
}

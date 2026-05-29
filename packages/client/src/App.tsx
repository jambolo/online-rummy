import { useEffect } from "react";
import { connect, disconnect, send } from "./net/ws";
import { useAppStore } from "./store";
import Home from "./routes/Home";
import Room from "./routes/Room";

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8080`;

export default function App() {
  const setConnected = useAppStore((s) => s.setConnected);
  const handleMessage = useAppStore((s) => s.handleMessage);
  const checkDisconnects = useAppStore((s) => s.checkDisconnects);
  const roomCode = useAppStore((s) => s.roomCode);
  const sessionId = useAppStore((s) => s.sessionId);

  useEffect(() => {
    connect(WS_URL, {
      onConnect: () => {
        setConnected(true);
        // Skip reconnect if we're already mid-game (e.g. HMR remount in dev).
        if (useAppStore.getState().publicState !== null) return;
        // Attempt lobby reconnect if we have stored credentials.
        const sid =
          sessionStorage.getItem("sessionId") ?? sessionId ?? undefined;
        const rc = sessionStorage.getItem("roomCode");
        const playerName = sessionStorage.getItem("playerName");
        if (sid && rc && playerName) {
          send({ t: "join", roomCode: rc, name: playerName, sessionId: sid });
        }
      },
      onDisconnect: () => setConnected(false),
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

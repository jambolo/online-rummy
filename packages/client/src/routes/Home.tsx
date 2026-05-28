import { useState } from "react";
import type { Variant } from "@online-rummy/shared";
import { useAppStore } from "../store";

const VARIANT_LABELS: Record<Variant, string> = {
  basic: "Classic Rummy",
  gin: "Gin Rummy",
  rum500: "500 Rum",
};

export default function Home() {
  const connected = useAppStore((s) => s.connected);
  const send = useAppStore((s) => s.send);
  const lastError = useAppStore((s) => s.lastError);
  const dismissError = useAppStore((s) => s.dismissError);

  const [name, setName] = useState("");
  const [variant, setVariant] = useState<Variant>("basic");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !connected) return;
    send({ t: "create", variant, name: n });
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const code = joinCode.trim().toUpperCase();
    if (!n || !code || !connected) return;
    send({ t: "join", roomCode: code, name: n });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <img
        src="/rum-runner-banner.png"
        alt="Rum Runner: The Ultimate Rummy Club"
        style={{ width: "100%", display: "block", maxHeight: 180, objectFit: "cover", objectPosition: "center" }}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
        }}
      >
      <div
        style={{
          background: "rgba(0,0,0,0.35)",
          borderRadius: 12,
          padding: 32,
          width: 360,
        }}
      >
        <img
          src="/rum-runner-logo.png"
          alt="Rum Runner"
          style={{ width: 96, height: 96, display: "block", margin: "0 auto 20px", borderRadius: "50%" }}
        />

        {!connected && (
          <div
            style={{
              background: "rgba(174,42,26,0.3)",
              border: "1px solid rgba(174,42,26,0.6)",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            Connecting to server…
          </div>
        )}

        {lastError && (
          <div
            style={{
              background: "rgba(174,42,26,0.8)",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 16,
              fontSize: 13,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{lastError}</span>
            <button
              onClick={dismissError}
              style={{ background: "transparent", padding: "0 6px", fontSize: 16 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Name */}
        <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
          Your name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alice"
          maxLength={20}
          style={{ width: "100%", marginBottom: 16 }}
        />

        {/* Tab */}
        <div style={{ display: "flex", marginBottom: 16, gap: 0 }}>
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                borderRadius: m === "create" ? "4px 0 0 4px" : "0 4px 4px 0",
                background:
                  mode === m
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 13,
              }}
            >
              {m === "create" ? "Create Room" : "Join Room"}
            </button>
          ))}
        </div>

        {mode === "create" && (
          <form onSubmit={handleCreate}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Variant
            </label>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as Variant)}
              style={{ width: "100%", marginBottom: 16 }}
            >
              {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
                <option key={v} value={v}>
                  {VARIANT_LABELS[v]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="primary"
              disabled={!name.trim() || !connected}
              style={{ width: "100%" }}
            >
              Create Room
            </button>
          </form>
        )}

        {mode === "join" && (
          <form onSubmit={handleJoin}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              Room code
            </label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="5-letter code"
              maxLength={5}
              style={{ width: "100%", marginBottom: 16, textTransform: "uppercase" }}
            />
            <button
              type="submit"
              className="primary"
              disabled={!name.trim() || joinCode.trim().length !== 5 || !connected}
              style={{ width: "100%" }}
            >
              Join Room
            </button>
          </form>
        )}
      </div>
      </div>
    </div>
  );
}

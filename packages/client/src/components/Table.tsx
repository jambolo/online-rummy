import { useAppStore } from "../store";
import CardComponent from "./Card";

export default function Table() {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const send = useAppStore((s) => s.send);

  if (!publicState) return null;

  const isMyTurn = publicState.turnPlayerId === myPlayerId;
  const drawPhase = publicState.phase === "draw";

  function drawStock() {
    send({ t: "draw", from: "stock" });
  }

  function drawDiscard() {
    send({ t: "draw", from: "discard" });
  }

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
      {/* Stock pile */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.6)",
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Stock ({publicState.stockSize})
        </div>
        <div
          onClick={isMyTurn && drawPhase ? drawStock : undefined}
          style={{
            width: 56,
            height: 80,
            border: "2px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            background: "#1a3a8a",
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 2px, transparent 0, transparent 50%)",
            backgroundSize: "8px 8px",
            cursor: isMyTurn && drawPhase ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 11,
            boxShadow:
              isMyTurn && drawPhase
                ? "0 0 10px rgba(74,158,255,0.6)"
                : "1px 2px 4px rgba(0,0,0,0.4)",
            transition: "box-shadow 0.15s",
          }}
        >
          {publicState.stockSize === 0 ? "—" : publicState.stockSize}
        </div>
      </div>

      {/* Discard pile */}
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.6)",
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Discard ({publicState.discardPileSize})
        </div>
        {publicState.discardTop ? (
          <CardComponent
            card={publicState.discardTop}
            {...(isMyTurn && drawPhase
              ? {
                  onClick: drawDiscard,
                  style: { boxShadow: "0 0 10px rgba(74,158,255,0.6)" },
                }
              : {})}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 80,
              border: "2px dashed rgba(255,255,255,0.2)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.3)",
              fontSize: 11,
            }}
          >
            empty
          </div>
        )}
      </div>
    </div>
  );
}

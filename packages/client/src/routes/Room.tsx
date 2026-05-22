import { useState } from "react";
import type { Card, Rank } from "@online-rummy/shared";
import { RANK_INDEX } from "@online-rummy/shared";
import { useAppStore } from "../store";
import CardComponent from "../components/Card";
import Hand from "../components/Hand";
import Table from "../components/Table";
import MeldZone from "../components/MeldZone";
import ActionBar from "../components/ActionBar";
import Chat from "../components/Chat";
import HowToPlayModal from "../components/HowToPlayModal";

// Compact opponent info strip shown above the table
function OpponentStrip() {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);

  if (!publicState) return null;

  const opponents = publicState.players.filter((p) => p.id !== myPlayerId);

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {opponents.map((p) => (
        <div
          key={p.id}
          style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: 6,
            padding: "6px 12px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            opacity: p.status === "forfeited" ? 0.45 : 1,
            outline:
              publicState.turnPlayerId === p.id
                ? "2px solid #7fff7f"
                : "none",
          }}
        >
          <span style={{ fontWeight: "bold", fontSize: 14 }}>{p.name}</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {p.handCount} cards
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {p.score}pts
          </span>
          {p.status === "forfeited" && (
            <span style={{ fontSize: 11, color: "#ff7f7f" }}>forfeited</span>
          )}
        </div>
      ))}
    </div>
  );
}

// Lobby waiting room
function Lobby({ onShowHelp }: { onShowHelp: () => void }) {
  const roomCode = useAppStore((s) => s.roomCode);
  const variant = useAppStore((s) => s.variant);
  const lobbyPlayers = useAppStore((s) => s.lobbyPlayers);
  const hostId = useAppStore((s) => s.hostId);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const send = useAppStore((s) => s.send);

  const isHost = myPlayerId === hostId;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
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
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Room {roomCode}</h2>
        <div
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {variant} · share code with friends
        </div>

        <div style={{ marginBottom: 20 }}>
          {lobbyPlayers.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span style={{ flex: 1 }}>{p.name}</span>
              {p.id === hostId && (
                <span style={{ fontSize: 11, color: "#ffd700" }}>host</span>
              )}
              {p.id === myPlayerId && (
                <span style={{ fontSize: 11, color: "#7fd4ff" }}>you</span>
              )}
            </div>
          ))}
        </div>

        {isHost ? (
          <button
            className="primary"
            onClick={() => send({ t: "start" })}
            disabled={lobbyPlayers.length < 2}
            style={{ width: "100%" }}
          >
            Start Game ({lobbyPlayers.length} players)
          </button>
        ) : (
          <div
            style={{
              textAlign: "center",
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
            }}
          >
            Waiting for host to start…
          </div>
        )}

        <button
          onClick={onShowHelp}
          style={{
            width: "100%",
            marginTop: 12,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            padding: "8px 0",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          How to Play
        </button>
      </div>
    </div>
  );
}

// Game score overlay shown when hand ends
// Basic rummy card point values (rules.md A.1.8)
const RANK_PTS: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5,
  "6": 6, "7": 7, "8": 8, "9": 9,
  "10": 10, J: 10, Q: 10, K: 10,
};
function cardPts(c: Card): number { return RANK_PTS[c.rank]; }
function handPts(cards: Card[]): number {
  return cards.reduce((s, c) => s + cardPts(c), 0);
}
const SUIT_ORDER: Record<string, number> = { S: 3, H: 2, D: 1, C: 0 };
// pointsFor: variant-specific scoring value (e.g. Ace=1 basic, Ace=15 500rum)
// RANK_INDEX: positional sequence A=0..K=12, always fixed — used only as tiebreaker
//             when two cards share the same scoring value (e.g. K/Q/J/10 all = 10pts)
function sortCardsDesc(cards: Card[], pointsFor: (c: Card) => number): Card[] {
  return [...cards].sort((a, b) => {
    const pts = pointsFor(b) - pointsFor(a);
    if (pts !== 0) return pts;
    const rank = RANK_INDEX[b.rank] - RANK_INDEX[a.rank];
    if (rank !== 0) return rank;
    return (SUIT_ORDER[b.suit] ?? 0) - (SUIT_ORDER[a.suit] ?? 0);
  });
}

function ScoreOverlay() {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const hostId = useAppStore((s) => s.hostId);
  const prevScores = useAppStore((s) => s.prevScores);
  const finalHands = useAppStore((s) => s.finalHands);
  const isGameOver = useAppStore((s) => s.isGameOver);
  const send = useAppStore((s) => s.send);

  if (!publicState || publicState.phase !== "ended") return null;

  const isHost = myPlayerId === hostId;
  const sorted = [...publicState.players].sort((a, b) => b.score - a.score);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "#1a4a1a",
          border: "2px solid rgba(255,255,255,0.2)",
          borderRadius: 12,
          padding: 32,
          width: 340,
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 4 }}>
          {isGameOver ? "Game Over!" : "Hand Over"}
        </h2>
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 20,
          }}
        >
          {isGameOver ? "A player reached 100 pts" : "Game target: 100 pts"}
        </div>

        {sorted.map((p, i) => {
          const prev = prevScores[p.id] ?? 0;
          const delta = p.score - prev;
          const isWinner = i === 0;
          const playerCards = sortCardsDesc(finalHands[p.id] ?? [], cardPts);
          const playerCardPts = handPts(playerCards);

          return (
            <div
              key={p.id}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {/* Name + scores row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  fontSize: isWinner ? 15 : 13,
                  fontWeight: isWinner ? "bold" : "normal",
                }}
              >
                <span>
                  {isWinner ? "🏆 " : ""}
                  {p.name}
                  {p.id === myPlayerId ? " (you)" : ""}
                </span>
                <span style={{ display: "flex", gap: 16 }}>
                  <span
                    style={{
                      color: delta > 0 ? "#7fff7f" : "rgba(255,255,255,0.4)",
                      fontSize: 13,
                    }}
                  >
                    {delta > 0 ? `+${delta}` : "—"}
                  </span>
                  <span style={{ minWidth: 52, textAlign: "right" }}>
                    {p.score} pts
                  </span>
                </span>
              </div>

              {/* Score explanation */}
              {isWinner && delta > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    marginTop: 3,
                  }}
                >
                  Won hand — scored {delta} pts from opponents' unmelded cards
                </div>
              )}

              {/* Unmelded cards breakdown — visible for all players */}
              {playerCards.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.5)",
                      marginBottom: 4,
                    }}
                  >
                    {p.id === myPlayerId ? "Your" : `${p.name}'s`} unmelded cards ({playerCardPts} pts):
                  </div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {playerCards.map((c) => (
                      <div key={c.id} style={{ position: "relative" }}>
                        <CardComponent
                          card={c}
                          compact
                          style={{ width: 36, height: 50, fontSize: 10 }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            bottom: 2,
                            right: 3,
                            fontSize: 9,
                            color: "#555",
                            fontWeight: "bold",
                          }}
                        >
                          {cardPts(c)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {isHost ? (
          <button
            className="primary"
            onClick={() => send({ t: "start" })}
            style={{ width: "100%", marginTop: 20 }}
          >
            {isGameOver ? "Play Again" : "New Hand"}
          </button>
        ) : (
          <div
            style={{
              textAlign: "center",
              marginTop: 20,
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
            }}
          >
            Waiting for host…
          </div>
        )}
      </div>
    </div>
  );
}

export default function Room() {
  const publicState = useAppStore((s) => s.publicState);
  const variant = useAppStore((s) => s.variant);
  const lastError = useAppStore((s) => s.lastError);
  const dismissError = useAppStore((s) => s.dismissError);
  const [showHelp, setShowHelp] = useState(false);

  const helpVariant = publicState?.variant ?? variant;

  // No publicState yet → still in lobby
  if (!publicState) return (
    <>
      <Lobby onShowHelp={() => setShowHelp(true)} />
      {showHelp && helpVariant && (
        <HowToPlayModal variant={helpVariant} onClose={() => setShowHelp(false)} />
      )}
    </>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        padding: 12,
        gap: 10,
        overflow: "hidden",
      }}
    >
      {showHelp && helpVariant && (
        <HowToPlayModal variant={helpVariant} onClose={() => setShowHelp(false)} />
      )}
      <ScoreOverlay />

      {/* Error banner */}
      {lastError && (
        <div
          style={{
            background: "rgba(174,42,26,0.8)",
            borderRadius: 6,
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <span>{lastError}</span>
          <button
            onClick={dismissError}
            style={{ background: "transparent", padding: "2px 8px", fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Header row: opponents + How to Play */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <OpponentStrip />
        </div>
        <button
          onClick={() => setShowHelp(true)}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "rgba(255,255,255,0.6)",
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 5,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          How to Play
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", gap: 10, minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflow: "auto",
          }}
        >
          <Table />
          <MeldZone />
        </div>
        <Chat />
      </div>

      {/* Bottom: action bar + hand */}
      <div style={{ flexShrink: 0 }}>
        <ActionBar />
        <Hand />
      </div>
    </div>
  );
}

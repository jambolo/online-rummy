import { useState } from "react";
import type { Card } from "@online-rummy/shared";
import { RANK_INDEX, cardPoints } from "@online-rummy/shared";
import { useAppStore } from "../store";
import CardComponent from "../components/Card";
import Hand from "../components/Hand";
import Table from "../components/Table";
import MeldZone from "../components/MeldZone";
import ActionBar from "../components/ActionBar";
import Chat from "../components/Chat";
import HowToPlayModal from "../components/HowToPlayModal";

// Styled yes/no confirmation modal (avoids the jarring native confirm dialog).
function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        style={{
          background: "#1a4a1a",
          border: "2px solid rgba(255,255,255,0.2)",
          borderRadius: 12,
          padding: 28,
          width: 320,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 14, marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              padding: "8px 0",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              background: "rgba(174,42,26,0.85)",
              border: "1px solid rgba(174,42,26,1)",
              color: "#fff",
              padding: "8px 0",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Leave-game button with a confirmation step. Leaving cancels the game for everyone.
function LeaveButton({ style }: { style?: React.CSSProperties }) {
  const leaveGame = useAppStore((s) => s.leaveGame);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        style={{
          background: "transparent",
          border: "1px solid rgba(255,127,127,0.4)",
          color: "rgba(255,127,127,0.85)",
          fontSize: 12,
          padding: "4px 10px",
          borderRadius: 5,
          cursor: "pointer",
          flexShrink: 0,
          ...style,
        }}
      >
        Leave Game
      </button>
      {confirming && (
        <ConfirmModal
          message="Leave the game? This cancels the game for everyone and returns all players to the start page."
          confirmLabel="Leave Game"
          onConfirm={leaveGame}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

// Prompt shown when another player has gone silent past the disconnect threshold.
// "Cancel Game" tears the game down for everyone; "Keep Waiting" snoozes the warning.
function DisconnectWarningModal() {
  const warning = useAppStore((s) => s.disconnectWarning);
  const leaveGame = useAppStore((s) => s.leaveGame);
  const dismiss = useAppStore((s) => s.dismissDisconnectWarning);

  if (!warning) return null;

  return (
    <ConfirmModal
      message={`${warning.name} hasn't sent any messages in over 5 minutes and has probably disconnected. Do you want to cancel the game?`}
      confirmLabel="Cancel Game"
      cancelLabel="Keep Waiting"
      onConfirm={leaveGame}
      onCancel={dismiss}
    />
  );
}

// Compact opponent info strip shown above the table
function OpponentStrip() {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);

  if (!publicState) return null;

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {publicState.players.map((p) => (
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
          {p.id === myPlayerId && (
            <span style={{ fontSize: 11, color: "#7fd4ff" }}>you</span>
          )}
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
        <img
          src="/rum-runner-logo.png"
          alt="Rum Runner"
          style={{ width: 72, height: 72, display: "block", margin: "0 auto 16px", borderRadius: "50%" }}
        />
        <h2 style={{ fontSize: 20, marginBottom: 4, textAlign: "center" }}>Room {roomCode}</h2>
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

        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <LeaveButton style={{ width: "100%" }} />
        </div>
      </div>
    </div>
  );
}

// Card point values per variant. Basic / Gin: rules.md A.1.8 (ace = 1).
// 500 Rum: rules.md A.4.2 (ace in hand always 15 per locked house rule simplification).
function cardPtsBasic(c: Card): number { return cardPoints(c, 1); }
function cardPts500(c: Card): number { return cardPoints(c, 15); }
function handPts(cards: Card[], ptsFn: (c: Card) => number): number {
  return cards.reduce((s, c) => s + ptsFn(c), 0);
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
  const meldCredits = useAppStore((s) => s.meldCredits);
  const handDeadwood = useAppStore((s) => s.handDeadwood);
  const ginInfo = useAppStore((s) => s.ginInfo);
  const isGameOver = useAppStore((s) => s.isGameOver);
  const handCancelled = useAppStore((s) => s.handCancelled);
  const send = useAppStore((s) => s.send);

  if (!publicState || publicState.phase !== "ended") return null;

  const isHost = myPlayerId === hostId;
  const sorted = [...publicState.players].sort((a, b) => b.score - a.score);
  const is500 = publicState.variant === "rum500";
  const isGin = publicState.variant === "gin";
  const cardPts = is500 ? cardPts500 : cardPtsBasic;
  const gameTarget = is500 ? 500 : 100;

  // rules.md A.2.3 stock-depletion cancel: no scoring; show simple banner + Re-deal.
  if (handCancelled) {
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
            textAlign: "center",
          }}
        >
          <h2 style={{ marginBottom: 8 }}>Hand Cancelled</h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>
            Stock ran low before anyone knocked. No score this hand — same dealer re-deals.
          </div>
          {sorted.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                fontSize: 13,
              }}
            >
              <span>{p.name}{p.id === myPlayerId ? " (you)" : ""}</span>
              <span>{p.score} pts</span>
            </div>
          ))}
          {isHost ? (
            <button
              className="primary"
              onClick={() => send({ t: "start" })}
              style={{ width: "100%", marginTop: 20 }}
            >
              Re-deal
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
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <LeaveButton />
          </div>
        </div>
      </div>
    );
  }

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
          {isGameOver
            ? `A player reached ${gameTarget} pts`
            : `Game target: ${gameTarget} pts`}
        </div>

        {sorted.map((p, i) => {
          const prev = prevScores[p.id] ?? 0;
          const delta = p.score - prev;
          const isWinner = i === 0;
          const playerCards = sortCardsDesc(finalHands[p.id] ?? [], cardPts);
          const playerCardPts = handDeadwood[p.id] ?? handPts(playerCards, cardPts);

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
                      color:
                        delta > 0
                          ? "#7fff7f"
                          : delta < 0
                            ? "#ff7f7f"
                            : "rgba(255,255,255,0.4)",
                      fontSize: 13,
                    }}
                  >
                    {delta > 0
                      ? `+${delta}`
                      : delta < 0
                        ? `${delta}`
                        : "—"}
                  </span>
                  <span style={{ minWidth: 52, textAlign: "right" }}>
                    {p.score} pts
                  </span>
                </span>
              </div>

              {/* Gin result — shows knock/gin/undercut label and deadwood for each player */}
              {isGin && ginInfo && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                  {p.id === ginInfo.knockerId
                    ? ginInfo.result === "gin"
                      ? `Gin! — 0 deadwood (+20 gin bonus, +20 box)`
                      : ginInfo.result === "knock"
                        ? `Knocked — ${ginInfo.knockerDeadwood} deadwood (+20 box)`
                        : `Knocked — ${ginInfo.knockerDeadwood} deadwood (undercut!)`
                    : ginInfo.result === "undercut"
                      ? `Undercut! — ${ginInfo.defenderDeadwood} deadwood (+10 undercut, +20 box)`
                      : `${ginInfo.defenderDeadwood} deadwood`}
                </div>
              )}
              {/* Score explanation — basic only; 500 Rum delta covers many sources */}
              {!is500 && !isGin && isWinner && delta > 0 && (
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

              {/* Melded cards credited to this player (rules.md A.4.6 — layoffs credit
                  the placer, not the meld owner). Shown for all variants; basic uses
                  same placer == owner. Server pre-computes per-card pts (500 Rum ace
                  varies by run direction). */}
              {(() => {
                const credited = [...(meldCredits[p.id] ?? [])].sort(
                  (a, b) => b.pts - a.pts,
                );
                if (credited.length === 0) return null;
                const meldedPts = credited.reduce((s, x) => s + x.pts, 0);
                return (
                  <div style={{ marginTop: 6 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.5)",
                        marginBottom: 4,
                      }}
                    >
                      {p.id === myPlayerId ? "Your" : `${p.name}'s`} melded cards (+{meldedPts} pts):
                    </div>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {credited.map(({ card, pts }) => (
                        <div key={card.id} style={{ position: "relative" }}>
                          <CardComponent
                            card={card}
                            compact
                            style={{ width: 36, height: 50, fontSize: 10 }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: 2,
                              right: 3,
                              fontSize: 9,
                              color: "#2a7a2a",
                              fontWeight: "bold",
                            }}
                          >
                            +{pts}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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
                    {p.id === myPlayerId ? "Your" : `${p.name}'s`} unmelded cards ({is500 ? `−${playerCardPts}` : playerCardPts} pts):
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
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <LeaveButton />
        </div>
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
      <DisconnectWarningModal />
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
      <DisconnectWarningModal />
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

      {/* Header row: logo + opponents + How to Play */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <img
          src="/rum-runner-logo.png"
          alt="Rum Runner"
          style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }}
        />
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
        <LeaveButton />
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

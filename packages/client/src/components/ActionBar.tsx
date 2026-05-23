import type { Suit } from "@online-rummy/shared";
import { useAppStore } from "../store";

const SUIT_SYMBOL: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };

const PHASE_LABEL: Record<string, string> = {
  draw: "Draw a card",
  meld: "Meld or discard",
  discard: "Discard a card",
  ended: "Hand over",
};

export default function ActionBar() {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const selectedCardIds = useAppStore((s) => s.selectedCardIds);
  const send = useAppStore((s) => s.send);
  const clearSelect = useAppStore((s) => s.clearSelect);

  if (!publicState) return null;

  const isMyTurn = publicState.turnPlayerId === myPlayerId;
  const phase = publicState.phase;
  const sel = selectedCardIds;
  const is500 = publicState.variant === "rum500";
  const mustMeldCardId = publicState.mustMeldCardId;
  const mustMeldBlock = isMyTurn && mustMeldCardId !== null;

  const myMeldsCount =
    publicState.players.find((p) => p.id === myPlayerId)?.melds.length ?? 0;

  const turnPlayerName =
    publicState.players.find((p) => p.id === publicState.turnPlayerId)?.name ??
    "…";

  function doMeld() {
    send({ t: "meld", cardIds: sel });
  }

  function doDiscard() {
    const cardId = sel[0];
    if (!cardId) return;
    send({ t: "discard", cardId });
    clearSelect();
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 0",
        flexWrap: "wrap",
        minHeight: 40,
      }}
    >
      {/* Phase / turn label */}
      <div
        style={{
          fontSize: 13,
          fontWeight: "bold",
          color: isMyTurn ? "#7fff7f" : "rgba(255,255,255,0.55)",
          minWidth: 160,
        }}
      >
        {isMyTurn
          ? PHASE_LABEL[phase] ?? phase
          : `${turnPlayerName}: ${PHASE_LABEL[phase] ?? phase}`}
      </div>

      {/* ── Draw phase ── */}
      {isMyTurn && phase === "draw" && (
        <>
          <button
            className="primary"
            onClick={() => send({ t: "draw", from: "stock" })}
            disabled={publicState.stockSize === 0}
          >
            Draw from stock ({publicState.stockSize})
          </button>
          {publicState.discardTop && (
            <button onClick={() => send({ t: "draw", from: "discard" })}>
              Draw {publicState.discardTop.rank}
              {SUIT_SYMBOL[publicState.discardTop.suit]} from discard
            </button>
          )}
        </>
      )}

      {/* ── Meld / discard phase ── */}
      {isMyTurn && (phase === "meld" || phase === "discard") && (
        <>
          {/* 500 Rum mustMeldCardId notice (rules.md A.4.4) */}
          {mustMeldBlock && (
            <span
              style={{
                fontSize: 12,
                color: "#ffd166",
                fontWeight: "bold",
              }}
            >
              Must meld or lay off your dived card before discarding.
            </span>
          )}

          {/* Meld button: 500 Rum allows multiple melds per turn, basic only one */}
          {(phase === "meld" || (is500 && phase === "discard")) &&
            sel.length >= 2 && (
              <button className="primary" onClick={doMeld}>
                Meld {sel.length} cards
              </button>
            )}

          {/* Discard — exactly 1 card; blocked in 500 Rum while a pile-dived card is unplaced */}
          {sel.length === 1 && (
            <button
              className="danger"
              onClick={doDiscard}
              disabled={mustMeldBlock}
              title={mustMeldBlock ? "Place the dived card first" : undefined}
            >
              Discard selected
            </button>
          )}

          {/* Guidance when nothing selected */}
          {sel.length === 0 && !mustMeldBlock && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              {phase === "meld"
                ? myMeldsCount === 0
                  ? "Select 3+ cards to meld, or 1 to discard"
                  : "Select cards to meld/layoff, or 1 to discard"
                : "Select 1 card to discard"}
            </span>
          )}
        </>
      )}

      {/* Selection counter + clear */}
      {sel.length > 0 && (
        <button
          onClick={clearSelect}
          style={{ marginLeft: "auto", opacity: 0.7 }}
        >
          Clear {sel.length} selected
        </button>
      )}
    </div>
  );
}

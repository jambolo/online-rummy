import { useState } from "react";
import type { Card, Suit } from "@online-rummy/shared";
import { cardPoints, validateMeld } from "@online-rummy/shared";
import { useAppStore } from "../store";
import { t } from "../theme/tokens";
import { variationAccent } from "../theme/variations";
import { useBreakpoint } from "../theme/useBreakpoint";
import Modal from "./Modal";

const SUIT_SYMBOL: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };

// Gin meld validation: ace low only (rules.md A.2 house rule).
const GIN_MELD_OPTS = { aceHigh: false, roundTheCorner: false } as const;

const PHASE_LABEL: Record<string, string> = {
  firstUpcardOffer: "Take upcard or pass",
  draw: "Draw a card",
  meld: "Meld or discard",
  discard: "Discard or knock",
  layoff: "Lay off on melds",
  ended: "Hand over",
};

function isValidGinMeld(cards: Card[]): boolean {
  return validateMeld(cards, GIN_MELD_OPTS);
}

function cardLabel(c: Card): string {
  return `${c.rank}${SUIT_SYMBOL[c.suit]}`;
}

// Chip styles for knock/defender meld groups and gin layoffs.
const chipMeld: React.CSSProperties = {
  background: "rgba(127,255,127,0.15)", // NS-1 one-off: --chip-meld surface
  border: "1px solid rgba(127,255,127,0.4)", // NS-1 one-off: --chip-meld border
  borderRadius: t.radiusChip,
  padding: "2px 6px",
  fontSize: 12,
  display: "flex",
  gap: 4,
  alignItems: "center",
};

const chipLayoff: React.CSSProperties = {
  background: "rgba(100,160,255,0.15)", // NS-1 one-off: --chip-layoff surface
  border: "1px solid rgba(100,160,255,0.4)", // NS-1 one-off: --chip-layoff border
  borderRadius: t.radiusChip,
  padding: "2px 6px",
  fontSize: 12,
  display: "flex",
  gap: 4,
  alignItems: "center",
};

const chipRemoveBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: t.text50,
  cursor: "pointer",
  padding: "0 2px",
  fontSize: 13,
  lineHeight: 1,
};

export default function ActionBar() {
  const publicState = useAppStore((s) => s.publicState);
  const privateState = useAppStore((s) => s.privateState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const selectedCardIds = useAppStore((s) => s.selectedCardIds);
  const knockMelds = useAppStore((s) => s.knockMelds);
  const ginLayoffs = useAppStore((s) => s.ginLayoffs);
  const send = useAppStore((s) => s.send);
  const clearSelect = useAppStore((s) => s.clearSelect);
  const addKnockMeld = useAppStore((s) => s.addKnockMeld);
  const removeKnockMeld = useAppStore((s) => s.removeKnockMeld);
  const clearKnockMelds = useAppStore((s) => s.clearKnockMelds);
  const ginDefenderMelds = useAppStore((s) => s.ginDefenderMelds);
  const addGinDefenderMeld = useAppStore((s) => s.addGinDefenderMeld);
  const removeGinDefenderMeld = useAppStore((s) => s.removeGinDefenderMeld);
  const clearGinDefenderMelds = useAppStore((s) => s.clearGinDefenderMelds);
  const removeGinLayoff = useAppStore((s) => s.removeGinLayoff);
  const clearGinLayoffs = useAppStore((s) => s.clearGinLayoffs);

  // Set when a discard is held pending confirmation because the card could be laid off.
  const [pendingDiscardId, setPendingDiscardId] = useState<string | null>(null);

  const isMobile = useBreakpoint() === "mobile";

  if (!publicState) return null;

  const isMyTurn = publicState.turnPlayerId === myPlayerId;
  const phase = publicState.phase;
  const sel = selectedCardIds;
  const is500 = publicState.variant === "rum500";
  const isGin = publicState.variant === "gin";
  // Gin: did the knocker go gin (0 deadwood)? Their hand is empty after the knock. When
  // true the defender may group their own melds but cannot lay off (rules.md A.2.4).
  const ginKnockerId =
    publicState.variantPublic.variant === "gin"
      ? publicState.variantPublic.data.ginKnockerId
      : null;
  const knockerWentGin =
    isGin &&
    ginKnockerId !== null &&
    publicState.players.find((p) => p.id === ginKnockerId)?.handCount === 0;
  const mustMeldCardId =
    publicState.variantPublic.variant === 'rum500'
      ? publicState.variantPublic.data.mustMeldCardId
      : null;
  const mustMeldBlock = isMyTurn && mustMeldCardId !== null;

  const myMeldsCount =
    publicState.players.find((p) => p.id === myPlayerId)?.melds.length ?? 0;

  const turnPlayerName =
    publicState.players.find((p) => p.id === publicState.turnPlayerId)?.name ??
    "…";

  function doMeld() {
    send({ t: "meld", cardIds: sel });
  }

  // Layoff opts per game variation (mirrors server: basic ace-low, 500 Rummy ace-either-end).
  const layoffOpts = is500
    ? { aceHigh: false, roundTheCorner: false, aceEitherEnd: true }
    : { aceHigh: false, roundTheCorner: false };

  // Could `card` currently be laid off onto a meld on the table? (non-gin only)
  // Basic requires the player to already have a meld (rules.md A.1.6); 500 Rummy does not (A.4.6).
  function canLayoffCard(card: Card): boolean {
    if (isGin) return false;
    if (!is500 && myMeldsCount === 0) return false;
    return publicState!.players.some((p) =>
      p.melds.some((m) => {
        const meldCards = m.cards ?? [];
        return meldCards.length > 0 && validateMeld([...meldCards, card], layoffOpts);
      }),
    );
  }

  function doDiscard() {
    const cardId = sel[0];
    if (!cardId) return;
    const card = (privateState?.hand ?? []).find((c) => c.id === cardId);
    if (card && canLayoffCard(card)) {
      setPendingDiscardId(cardId);
      return;
    }
    send({ t: "discard", cardId });
    clearSelect();
  }

  function confirmDiscard() {
    if (!pendingDiscardId) return;
    send({ t: "discard", cardId: pendingDiscardId });
    setPendingDiscardId(null);
    clearSelect();
  }

  // ── Gin: compute deadwood relative to declared knock meld groups ──
  const knockMeldedIds = new Set(knockMelds.flat());
  const hand = privateState?.hand ?? [];

  // The knock discard: exactly 1 non-melded card selected — will be discarded face-down
  // as the knock signal (rules.md A.2.4).
  const knockDiscardId = sel.length === 1 && !knockMeldedIds.has(sel[0]!) ? sel[0]! : null;
  const deadwoodCards = hand.filter(
    (c) => !knockMeldedIds.has(c.id) && c.id !== knockDiscardId,
  );
  const deadwoodValue = deadwoodCards.reduce((s, c) => s + cardPoints(c, 1), 0);

  const selCards = sel.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined);
  const selAlreadyMelded = sel.some((id) => knockMeldedIds.has(id));
  const canAddKnockMeld = isGin && isMyTurn && sel.length >= 3 && !selAlreadyMelded && isValidGinMeld(selCards);
  const canKnock = isGin && isMyTurn && phase === "discard" && knockDiscardId !== null && deadwoodValue <= 10;

  function doKnock() {
    if (!knockDiscardId) return;
    send({ t: "knock", melds: knockMelds, discardId: knockDiscardId });
    clearKnockMelds();
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
          // My turn keeps the green turn cue [V7]; otherwise tint with the
          // game-variation accent (NS-7 identity).
          color: isMyTurn ? t.accentPositive : variationAccent(publicState.variant),
          minWidth: isMobile ? 0 : 160,
          flexBasis: isMobile ? "100%" : "auto",
        }}
      >
        {(() => {
          // Against gin the defender's "layoff" phase is meld-grouping only — relabel.
          const lbl =
            phase === "layoff" && knockerWentGin
              ? "Arrange your melds"
              : PHASE_LABEL[phase] ?? phase;
          if (!isMyTurn) return `${turnPlayerName}: ${lbl}`;
          return isGin && phase === "discard" ? "Discard or knock" : lbl;
        })()}
      </div>

      {/* ── First-upcard offer (Gin only, rules.md A.2.2) ── */}
      {isGin && isMyTurn && phase === "firstUpcardOffer" && publicState.discardTop && (
        <>
          <button
            className="primary"
            onClick={() => send({ t: "draw", from: "discard" })}
          >
            Take {publicState.discardTop.rank}
            {SUIT_SYMBOL[publicState.discardTop.suit]}
          </button>
          <button onClick={() => send({ t: "passUpcard" })}>Pass</button>
          <span style={{ fontSize: 12, color: t.text55 }}>
            Opening upcard offer — take it or pass to opponent.
          </span>
        </>
      )}

      {/* ── Draw phase ── */}
      {isMyTurn && phase === "draw" && (
        <>
          <button
            className="primary"
            onClick={() => send({ t: "draw", from: "stock" })}
            disabled={publicState.stockSize === 0}
          >
            {isMobile ? "Draw" : "Draw from stock"} ({publicState.stockSize})
          </button>
          {publicState.discardTop && (
            <button onClick={() => send({ t: "draw", from: "discard" })}>
              {isMobile ? "Take " : "Draw "}
              {publicState.discardTop.rank}
              {SUIT_SYMBOL[publicState.discardTop.suit]}
              {isMobile ? "" : " from discard"}
            </button>
          )}
        </>
      )}

      {/* ── Gin discard phase: knock meld builder ── */}
      {isGin && isMyTurn && phase === "discard" && (
        <>
          {/* Declared knock meld groups */}
          {knockMelds.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {knockMelds.map((group, i) => {
                const groupCards = group.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined);
                return (
                  <span key={i} style={chipMeld}>
                    {groupCards.map(cardLabel).join(" ")}
                    <button onClick={() => removeKnockMeld(i)} style={chipRemoveBtn}>×</button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Deadwood indicator */}
          <span
            style={{
              fontSize: 12,
              color: deadwoodValue <= 10 ? t.accentPositive : t.text55,
              fontWeight: deadwoodValue <= 10 ? "bold" : "normal",
            }}
          >
            Deadwood: {deadwoodValue}{deadwoodValue <= 10 ? " ✓" : ` (need ≤10)`}
          </span>

          {canAddKnockMeld && (
            <button className="primary" onClick={() => addKnockMeld(sel)}>
              Group {sel.length} cards
            </button>
          )}

          {canKnock && (
            <button
              className="primary"
              onClick={doKnock}
              style={{ background: deadwoodValue === 0 ? t.accentGin : undefined }}
            >
              {deadwoodValue === 0 ? "Gin!" : `Knock`}
            </button>
          )}

          {sel.length === 1 && !knockMeldedIds.has(sel[0]!) && (
            <button className="danger" onClick={doDiscard}>
              {isMobile ? "Discard" : "Discard selected"}
            </button>
          )}

          {sel.length === 0 && knockMelds.length === 0 && (
            <span style={{ fontSize: 12, color: t.text45 }}>
              Select 3+ cards to group as a meld, then select 1 card to discard or knock
            </span>
          )}
          {sel.length === 0 && knockMelds.length > 0 && (
            <span style={{ fontSize: 12, color: t.text45 }}>
              Select 1 card to discard{deadwoodValue <= 10 ? " — or knock with it" : " (group more melds to reduce deadwood)"}
            </span>
          )}
        </>
      )}

      {/* ── Gin layoff phase (defender: declare own melds; lay off onto knocker's melds
            only after a regular knock — no layoff against gin, rules.md A.2.4) ── */}
      {isGin && phase === "layoff" && (
        <>
          {isMyTurn && (() => {
            const ginDefenderMeldedIds = new Set(ginDefenderMelds.flat());
            const defSelCards = sel
              .map((id) => hand.find((c) => c.id === id))
              .filter((c): c is Card => c !== undefined);
            const defSelAlreadyMelded = sel.some((id) => ginDefenderMeldedIds.has(id));
            const canAddDefenderMeld =
              sel.length >= 3 && !defSelAlreadyMelded && isValidGinMeld(defSelCards);

            const totalActions = ginDefenderMelds.length + ginLayoffs.length;
            const submitLabel =
              totalActions === 0
                ? knockerWentGin
                  ? "Submit (no melds)"
                  : "Submit (no melds or layoffs)"
                : `Submit ${[
                    ginDefenderMelds.length > 0
                      ? `${ginDefenderMelds.length} meld${ginDefenderMelds.length > 1 ? "s" : ""}`
                      : null,
                    ginLayoffs.length > 0
                      ? `${ginLayoffs.length} layoff${ginLayoffs.length > 1 ? "s" : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" + ")}`;

            return (
              <>
                {ginDefenderMelds.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {ginDefenderMelds.map((group, i) => {
                      const groupCards = group
                        .map((id) => hand.find((c) => c.id === id))
                        .filter((c): c is Card => c !== undefined);
                      return (
                        <span key={i} style={chipMeld}>
                          {groupCards.map(cardLabel).join(" ")}
                          <button onClick={() => removeGinDefenderMeld(i)} style={chipRemoveBtn}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {ginLayoffs.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {ginLayoffs.map((layoff, i) => {
                      const card = hand.find((c) => c.id === layoff.cardId);
                      return (
                        <span key={i} style={chipLayoff}>
                          {card ? cardLabel(card) : layoff.cardId} → meld
                          <button onClick={() => removeGinLayoff(i)} style={chipRemoveBtn}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {canAddDefenderMeld && (
                  <button className="primary" onClick={() => addGinDefenderMeld(sel)}>
                    Declare meld ({sel.length} cards)
                  </button>
                )}

                <button
                  className="primary"
                  onClick={() => {
                    send({ t: "ginLayoff", ownMelds: ginDefenderMelds, layoffs: ginLayoffs });
                    clearGinDefenderMelds();
                    clearGinLayoffs();
                    clearSelect();
                  }}
                >
                  {submitLabel}
                </button>

                {sel.length === 0 && totalActions === 0 && (
                  <span style={{ fontSize: 12, color: t.text45 }}>
                    {knockerWentGin
                      ? "Opponent went gin — group your melds to reduce deadwood. No layoff allowed."
                      : "Select 3+ cards to declare a meld, or select 1 card then click + on a meld to lay off"}
                  </span>
                )}
              </>
            );
          })()}

          {!isMyTurn && (
            <span style={{ fontSize: 12, color: t.text55 }}>
              {knockerWentGin
                ? "Opponent is arranging their melds…"
                : "Opponent is declaring melds and laying off…"}
            </span>
          )}
        </>
      )}

      {/* ── Non-gin meld / discard phase ── */}
      {!isGin && isMyTurn && (phase === "meld" || phase === "discard") && (
        <>
          {mustMeldBlock && (
            <span style={{ fontSize: 12, color: t.accentAttention, fontWeight: "bold" }}>
              ▲ Must meld or lay off your dived card before discarding.
            </span>
          )}

          {(phase === "meld" || (is500 && phase === "discard")) && sel.length >= 2 && (
            <button className="primary" onClick={doMeld}>
              Meld {sel.length} cards
            </button>
          )}

          {sel.length === 1 && (
            <button
              className="danger"
              onClick={doDiscard}
              disabled={mustMeldBlock}
              title={mustMeldBlock ? "Place the dived card first" : undefined}
            >
              {isMobile ? "Discard" : "Discard selected"}
            </button>
          )}

          {sel.length === 0 && !mustMeldBlock && (
            <span style={{ fontSize: 12, color: t.text45 }}>
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

      {/* Confirm discard of a card that could still be laid off. */}
      {pendingDiscardId && (() => {
        const card = (privateState?.hand ?? []).find((c) => c.id === pendingDiscardId);
        return (
          <Modal
            ariaLabel="Confirm discard"
            onClose={() => setPendingDiscardId(null)}
            panelStyle={{
              background: t.surfacePanel,
              padding: 20,
              maxWidth: 360,
              color: t.text100,
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 16 }}>
              {card ? `${card.rank}${SUIT_SYMBOL[card.suit]}` : "This card"} can be laid
              off on a meld. Discard it anyway?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setPendingDiscardId(null)}>Cancel</button>
              <button className="danger" onClick={confirmDiscard}>
                Discard anyway
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

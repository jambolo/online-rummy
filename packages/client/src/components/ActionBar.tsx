import type { Card, Suit } from "@online-rummy/shared";
import { cardPoints, validateMeld } from "@online-rummy/shared";
import { useAppStore } from "../store";

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

  if (!publicState) return null;

  const isMyTurn = publicState.turnPlayerId === myPlayerId;
  const phase = publicState.phase;
  const sel = selectedCardIds;
  const is500 = publicState.variant === "rum500";
  const isGin = publicState.variant === "gin";
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

  function doDiscard() {
    const cardId = sel[0];
    if (!cardId) return;
    send({ t: "discard", cardId });
    clearSelect();
  }

  // ── Gin: compute deadwood relative to declared knock meld groups ──
  const knockMeldedIds = new Set(knockMelds.flat());
  const hand = privateState?.hand ?? [];

  // The knock discard: exactly 1 non-melded card selected — will be discarded face-down
  // as the knock signal (rules.md A.2.4). Deadwood is computed from remaining cards after
  // that discard, so deadwoodValue reflects the true post-discard count.
  const knockDiscardId = sel.length === 1 && !knockMeldedIds.has(sel[0]!) ? sel[0]! : null;
  const deadwoodCards = hand.filter(
    (c) => !knockMeldedIds.has(c.id) && c.id !== knockDiscardId,
  );
  const deadwoodValue = deadwoodCards.reduce((s, c) => s + cardPoints(c, 1), 0);

  const selCards = sel.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined);
  const selAlreadyMelded = sel.some((id) => knockMeldedIds.has(id));
  const canAddKnockMeld = isGin && isMyTurn && sel.length >= 3 && !selAlreadyMelded && isValidGinMeld(selCards);
  // Knock requires 1 card selected as face-down discard AND remaining deadwood ≤ 10.
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
          color: isMyTurn ? "#7fff7f" : "rgba(255,255,255,0.55)",
          minWidth: 160,
        }}
      >
        {isMyTurn
          ? (isGin && phase === "discard" ? "Discard or knock" : PHASE_LABEL[phase] ?? phase)
          : `${turnPlayerName}: ${PHASE_LABEL[phase] ?? phase}`}
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
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
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

      {/* ── Gin discard phase: knock meld builder ── */}
      {isGin && isMyTurn && phase === "discard" && (
        <>
          {/* Declared knock meld groups */}
          {knockMelds.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {knockMelds.map((group, i) => {
                const groupCards = group.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined);
                return (
                  <span
                    key={i}
                    style={{
                      background: "rgba(127,255,127,0.15)",
                      border: "1px solid rgba(127,255,127,0.4)",
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 12,
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    {groupCards.map(cardLabel).join(" ")}
                    <button
                      onClick={() => removeKnockMeld(i)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "rgba(255,255,255,0.5)",
                        cursor: "pointer",
                        padding: "0 2px",
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Deadwood indicator */}
          <span
            style={{
              fontSize: 12,
              color: deadwoodValue <= 10 ? "#7fff7f" : "rgba(255,255,255,0.55)",
              fontWeight: deadwoodValue <= 10 ? "bold" : "normal",
            }}
          >
            Deadwood: {deadwoodValue}{deadwoodValue <= 10 ? " ✓" : ` (need ≤10)`}
          </span>

          {/* Add group button */}
          {canAddKnockMeld && (
            <button
              className="primary"
              onClick={() => addKnockMeld(sel)}
            >
              Group {sel.length} cards
            </button>
          )}

          {/* Knock button */}
          {canKnock && (
            <button
              className="primary"
              onClick={doKnock}
              style={{ background: deadwoodValue === 0 ? "#6a0dad" : undefined }}
            >
              {deadwoodValue === 0 ? "Gin!" : `Knock`}
            </button>
          )}

          {/* Discard — not a card that's already in a declared knock meld */}
          {sel.length === 1 && !knockMeldedIds.has(sel[0]!) && (
            <button className="danger" onClick={doDiscard}>
              Discard selected
            </button>
          )}

          {/* Guidance */}
          {sel.length === 0 && knockMelds.length === 0 && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              Select 3+ cards to group as a meld, then select 1 card to discard or knock
            </span>
          )}
          {sel.length === 0 && knockMelds.length > 0 && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              Select 1 card to discard{deadwoodValue <= 10 ? " — or knock with it" : " (group more melds to reduce deadwood)"}
            </span>
          )}
        </>
      )}

      {/* ── Gin layoff phase (defender: declare own melds + lay off onto knocker's melds) ── */}
      {/* rules.md A.2.4 step 3: opponent separates own melds from deadwood, then may lay off */}
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
                ? "Done (no melds or layoffs)"
                : [
                    ginDefenderMelds.length > 0
                      ? `${ginDefenderMelds.length} meld${ginDefenderMelds.length > 1 ? "s" : ""}`
                      : null,
                    ginLayoffs.length > 0
                      ? `${ginLayoffs.length} layoff${ginLayoffs.length > 1 ? "s" : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" + ");

            return (
              <>
                {/* Declared own meld groups */}
                {ginDefenderMelds.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {ginDefenderMelds.map((group, i) => {
                      const groupCards = group
                        .map((id) => hand.find((c) => c.id === id))
                        .filter((c): c is Card => c !== undefined);
                      return (
                        <span
                          key={i}
                          style={{
                            background: "rgba(127,255,127,0.15)",
                            border: "1px solid rgba(127,255,127,0.4)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 12,
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          {groupCards.map(cardLabel).join(" ")}
                          <button
                            onClick={() => removeGinDefenderMeld(i)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "rgba(255,255,255,0.5)",
                              cursor: "pointer",
                              padding: "0 2px",
                              fontSize: 13,
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Staged layoffs — one chip per entry with × to remove */}
                {ginLayoffs.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {ginLayoffs.map((layoff, i) => {
                      const card = hand.find((c) => c.id === layoff.cardId);
                      return (
                        <span
                          key={i}
                          style={{
                            background: "rgba(100,160,255,0.15)",
                            border: "1px solid rgba(100,160,255,0.4)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 12,
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          {card ? cardLabel(card) : layoff.cardId} → meld
                          <button
                            onClick={() => removeGinLayoff(i)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "rgba(255,255,255,0.5)",
                              cursor: "pointer",
                              padding: "0 2px",
                              fontSize: 13,
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Declare own meld button */}
                {canAddDefenderMeld && (
                  <button className="primary" onClick={() => addGinDefenderMeld(sel)}>
                    Declare meld ({sel.length} cards)
                  </button>
                )}

                {/* Submit */}
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

                {/* Guidance */}
                {sel.length === 0 && totalActions === 0 && (
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    Select 3+ cards to declare a meld, or select 1 card then click + on a meld to lay off
                  </span>
                )}
              </>
            );
          })()}

          {!isMyTurn && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              Opponent is declaring melds and laying off…
            </span>
          )}
        </>
      )}

      {/* ── Non-gin meld / discard phase ── */}
      {!isGin && isMyTurn && (phase === "meld" || phase === "discard") && (
        <>
          {/* 500 Rum mustMeldCardId notice (rules.md A.4.4) */}
          {mustMeldBlock && (
            <span style={{ fontSize: 12, color: "#ffd166", fontWeight: "bold" }}>
              Must meld or lay off your dived card before discarding.
            </span>
          )}

          {/* Meld button: 500 Rum allows multiple melds per turn, basic only one */}
          {(phase === "meld" || (is500 && phase === "discard")) && sel.length >= 2 && (
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

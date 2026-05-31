import { useState } from "react";
import type { Card } from "@online-rummy/shared";
import { RANK_INDEX, validateMeld } from "@online-rummy/shared";
import { useAppStore } from "../store";
import CardComponent from "./Card";
import PileDiveModal from "./PileDiveModal";
import { t, sectionLabel } from "../theme/tokens";

// 500 Rummy meld options: ace-either-end (rules.md A.4.3).
const RUM500_OPTS = { aceHigh: false, roundTheCorner: false, aceEitherEnd: true } as const;

// 500 Rummy pile-dive preflight — checks if `selected` could anchor a run given the
// other same-suit cards available. Mirror of server canUseSelectedInMeldOrLayoff
// (packages/server/src/engine/variants/rum500.ts). UX hint only; server is authoritative.
function canFormRunWith(others: Card[], selected: Card): boolean {
  const sameSuit = others.filter((c) => c.suit === selected.suit);
  for (const aceHigh of [false, true]) {
    const idxOf = (c: Card) =>
      c.rank === "A" ? (aceHigh ? 13 : 0) : RANK_INDEX[c.rank];
    const target = idxOf(selected);
    const have = new Set(sameSuit.map(idxOf));
    have.add(target);
    for (let start = target - 2; start <= target; start++) {
      if (start < 0 || start + 2 > 13) continue;
      if (have.has(start) && have.has(start + 1) && have.has(start + 2)) return true;
    }
  }
  return false;
}

function canLayoffOnto(meldCards: Card[], selected: Card): boolean {
  return validateMeld([...meldCards, selected], RUM500_OPTS);
}

export default function Table() {
  const publicState = useAppStore((s) => s.publicState);
  const privateState = useAppStore((s) => s.privateState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const send = useAppStore((s) => s.send);
  const [showPile, setShowPile] = useState(false);

  if (!publicState) return null;

  const isMyTurn = publicState.turnPlayerId === myPlayerId;
  const drawPhase = publicState.phase === "draw";
  // rules.md A.2.2: during firstUpcardOffer the discard pile is clickable as the
  // accept-upcard action (Gin-only; basic/500Rum never enter this phase).
  const upcardOfferPhase = publicState.phase === "firstUpcardOffer";
  const is500 = publicState.variant === "rum500";
  const canDraw = isMyTurn && drawPhase;
  const canDrawDiscard = isMyTurn && (drawPhase || upcardOfferPhase);
  const pileHasCards = publicState.discardPileSize > 0;

  // 500 Rummy interactive picker: only when it is the player's turn to draw.
  const interactive = is500 && canDraw;

  function drawStock() {
    send({ t: "draw", from: "stock" });
  }

  function handleDiscardClick() {
    if (!pileHasCards) return;
    if (!is500 && canDrawDiscard) {
      send({ t: "draw", from: "discard" });
      return;
    }
    setShowPile(true);
  }

  function handlePilePick(cardId: string, isTopCard: boolean) {
    // Rules.md A.4.4: top-card pick is a plain draw, not a pile dive. Routing here keeps
    // the modal generic and prevents the server from setting mustMeldCardId for a top draw.
    if (isTopCard) send({ t: "draw", from: "discard" });
    else send({ t: "drawFromPile", cardId });
    setShowPile(false);
  }

  function canPickDeep(_cardId: string, idx: number): boolean {
    if (idx === 0) return true;
    if (!privateState) return true;
    const pile = publicState!.discardPile;
    const pickedBottomIdx = pile.length - 1 - idx;
    const selected = pile[pickedBottomIdx];
    if (!selected) return true;
    const wouldTake = pile.slice(pickedBottomIdx);
    const available: Card[] = [...privateState.hand, ...wouldTake];

    for (const p of publicState!.players) {
      for (const m of p.melds) {
        const cards = m.cards ?? [];
        if (canLayoffOnto(cards, selected)) return true;
      }
    }
    const others = available.filter((c) => c.id !== selected.id);
    if (others.filter((c) => c.rank === selected.rank).length >= 2) return true;
    return canFormRunWith(others, selected);
  }

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
      {/* Stock pile */}
      <div style={{ textAlign: "center" }}>
        <div style={{ ...sectionLabel, marginBottom: 4 }}>
          Stock ({publicState.stockSize})
        </div>
        <div
          onClick={canDraw ? drawStock : undefined}
          style={{
            width: 56,
            height: 80,
            border: `2px solid ${t.borderModal}`,
            borderRadius: t.radiusControl,
            background: t.cardBack,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 2px, transparent 0, transparent 50%)",
            backgroundSize: "8px 8px",
            cursor: canDraw ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: t.text40,
            fontSize: 11,
            boxShadow: canDraw
              ? "0 0 10px rgba(74,158,255,0.6)" // NS-1 one-off: focus-ring glow
              : "1px 2px 4px rgba(0,0,0,0.4)",   // NS-1 one-off: pile shadow
            transition: "box-shadow 0.15s",
          }}
        >
          {publicState.stockSize === 0 ? "—" : publicState.stockSize}
        </div>
      </div>

      {/* Discard pile */}
      <div style={{ textAlign: "center" }}>
        <div style={{ ...sectionLabel, marginBottom: 4 }}>
          Discard ({publicState.discardPileSize})
          {is500 && publicState.discardPileSize > 1 && " · dive"}
        </div>
        {publicState.discardTop ? (
          <CardComponent
            card={publicState.discardTop}
            {...(pileHasCards
              ? {
                  onClick: handleDiscardClick,
                  style: canDrawDiscard
                    ? { boxShadow: "0 0 10px rgba(74,158,255,0.6)" } // NS-1 one-off
                    : { cursor: "pointer" },
                }
              : {})}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 80,
              border: `2px dashed ${t.borderModal}`,
              borderRadius: t.radiusControl,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t.text30,
              fontSize: 11,
            }}
          >
            empty
          </div>
        )}
      </div>

      {showPile && (
        <PileDiveModal
          pile={publicState.discardPile}
          onClose={() => setShowPile(false)}
          {...(interactive
            ? { onPick: handlePilePick, canPick: canPickDeep }
            : { readOnly: true })}
        />
      )}
    </div>
  );
}

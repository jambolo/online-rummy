import { useState } from "react";
import type { Card } from "@online-rummy/shared";
import { RANK_INDEX } from "@online-rummy/shared";
import { useAppStore } from "../store";
import CardComponent from "./Card";
import PileDiveModal from "./PileDiveModal";

// Client-side mirror of server canUseSelectedInMeldOrLayoff (packages/server/src/engine/
// variants/rum500.ts) — used for pre-flight greying in the pile-dive modal. Server is
// authoritative; this is a UX hint only. Keep in sync.
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

function isRunValid(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0]?.suit;
  if (!cards.every((c) => c.suit === suit)) return false;
  for (const aceHigh of [false, true]) {
    const idxOf = (c: Card) =>
      c.rank === "A" ? (aceHigh ? 13 : 0) : RANK_INDEX[c.rank];
    const idxs = [...cards.map(idxOf)].sort((a, b) => a - b);
    let ok = true;
    for (let i = 1; i < idxs.length; i++) {
      if ((idxs[i] ?? 0) - (idxs[i - 1] ?? 0) !== 1) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function isSetValid(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  const r = cards[0]?.rank;
  return cards.every((c) => c.rank === r);
}

function canLayoffOnto(meldCards: Card[], selected: Card): boolean {
  const ext = [...meldCards, selected];
  return isSetValid(ext) || isRunValid(ext);
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

  // 500 Rum interactive picker: only when it is the player's turn to draw.
  const interactive = is500 && canDraw;
  // Basic variant has no pile dive: a draw-discard click on canDraw sends draw immediately.
  // Otherwise (any variant, any time, pile non-empty) clicking opens a read-only viewer.

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

  // Preflight: can `selected` (assumed pile-dive, idx >= 1) be melded or laid off given
  // current hand + the cards that would be taken with it? Mirrors server logic so the
  // modal grays cards the server would reject with ERR_NO_LEGAL_DIVE.
  function canPickDeep(_cardId: string, idx: number): boolean {
    if (idx === 0) return true; // top: always allowed (plain draw fallback).
    if (!privateState) return true; // can't compute; let server decide.
    const pile = publicState!.discardPile;
    // PileDiveModal reverses to render top-first; idx 0 is top. The bottom-up index of
    // a click at modal-idx i is (pile.length - 1 - i). Cards "above" the picked one in
    // pile-order are pile.slice(pickedBottomIdx + 1) — all taken with the dive.
    const pickedBottomIdx = pile.length - 1 - idx;
    const selected = pile[pickedBottomIdx];
    if (!selected) return true;
    const wouldTake = pile.slice(pickedBottomIdx); // selected + all above
    const available: Card[] = [...privateState.hand, ...wouldTake];

    // Layoff onto any existing meld.
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
          onClick={canDraw ? drawStock : undefined}
          style={{
            width: 56,
            height: 80,
            border: "2px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            background: "#1a3a8a",
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 2px, transparent 0, transparent 50%)",
            backgroundSize: "8px 8px",
            cursor: canDraw ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 11,
            boxShadow: canDraw
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
          {is500 && publicState.discardPileSize > 1 && " · dive"}
        </div>
        {publicState.discardTop ? (
          <CardComponent
            card={publicState.discardTop}
            {...(pileHasCards
              ? {
                  onClick: handleDiscardClick,
                  style: canDrawDiscard
                    ? { boxShadow: "0 0 10px rgba(74,158,255,0.6)" }
                    : { cursor: "pointer" },
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

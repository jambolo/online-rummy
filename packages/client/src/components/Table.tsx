import { useState } from 'react';
import type { Card } from '@online-rummy/shared';
import { RANK_INDEX, validateMeld } from '@online-rummy/shared';
import { useAppStore } from '../store';
import CardComponent from './Card';
import PileDiveModal from './PileDiveModal';
import { t, sectionLabel } from '../theme/tokens';
import { variationAccent } from '../theme/variations';

// 500 Rummy meld options: ace-either-end (rules.md A.4.3).
const RUM500_OPTS = { aceHigh: false, roundTheCorner: false, aceEitherEnd: true } as const;

// NS-2: branded RR card back — brass art-deco frame + monogram over the navy --card-back.
const CARD_BACK_MONOGRAM = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 80">` +
    `<rect x="4" y="4" width="48" height="72" rx="4" fill="none" stroke="#c6a04b" stroke-width="1.5"/>` +
    `<rect x="8.5" y="8.5" width="39" height="63" rx="3" fill="none" stroke="#c6a04b" stroke-width="0.75" opacity="0.55"/>` +
    `<text x="28" y="47" text-anchor="middle" font-family="Georgia,serif" font-size="24" font-weight="700" letter-spacing="-3" fill="#c6a04b">RR</text>` +
    `</svg>`,
)}")`;

// 500 Rummy pile-dive preflight — checks if `selected` could anchor a run given the
// other same-suit cards available. Mirror of server canUseSelectedInMeldOrLayoff
// (packages/server/src/engine/variants/rum500.ts). UX hint only; server is authoritative.
function canFormRunWith(others: Card[], selected: Card): boolean {
  const sameSuit = others.filter((c) => c.suit === selected.suit);
  for (const aceHigh of [false, true]) {
    const idxOf = (c: Card) => (c.rank === 'A' ? (aceHigh ? 13 : 0) : RANK_INDEX[c.rank]);
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

// Chained run layoff reachability (rules.md A.4.6) — mirror of server canBridgeRunToSelected.
// Greedily extends the run with same-suit bridge cards (monotonic), retesting selected after
// each addition. UX hint only; server is authoritative.
function canBridgeRunToSelected(meldCards: Card[], bridgePool: Card[], selected: Card): boolean {
  const run = [...meldCards];
  const pool = bridgePool.filter((c) => c.suit === selected.suit && c.id !== selected.id);
  for (;;) {
    if (validateMeld([...run, selected], RUM500_OPTS)) return true;
    const i = pool.findIndex((c) => validateMeld([...run, c], RUM500_OPTS));
    if (i === -1) return false;
    run.push(pool[i]!);
    pool.splice(i, 1);
  }
}

export default function Table() {
  const publicState = useAppStore((s) => s.publicState);
  const privateState = useAppStore((s) => s.privateState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const send = useAppStore((s) => s.send);
  const [showPile, setShowPile] = useState(false);

  if (!publicState) return null;

  const isMyTurn = publicState.turnPlayerId === myPlayerId;
  const drawPhase = publicState.phase === 'draw';
  // rules.md A.2.2: during firstUpcardOffer the discard pile is clickable as the
  // accept-upcard action (Gin-only; basic/500Rum never enter this phase).
  const upcardOfferPhase = publicState.phase === 'firstUpcardOffer';
  const is500 = publicState.variant === 'rum500';
  const accent = variationAccent(publicState.variant);
  const canDraw = isMyTurn && drawPhase;
  const canDrawDiscard = isMyTurn && (drawPhase || upcardOfferPhase);
  const pileHasCards = publicState.discardPileSize > 0;

  // 500 Rummy interactive picker: only when it is the player's turn to draw.
  const interactive = is500 && canDraw;

  function drawStock() {
    send({ t: 'draw', from: 'stock' });
  }

  function handleDiscardClick() {
    if (!pileHasCards) return;
    if (!is500 && canDrawDiscard) {
      send({ t: 'draw', from: 'discard' });
      return;
    }
    setShowPile(true);
  }

  function handlePilePick(cardId: string, isTopCard: boolean) {
    // Rules.md A.4.4: top-card pick is a plain draw, not a pile dive. Routing here keeps
    // the modal generic and prevents the server from setting mustMeldCardId for a top draw.
    if (isTopCard) send({ t: 'draw', from: 'discard' });
    else send({ t: 'drawFromPile', cardId });
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

    const others = available.filter((c) => c.id !== selected.id);
    for (const p of publicState!.players) {
      for (const m of p.melds) {
        const cards = m.cards ?? [];
        if (canLayoffOnto(cards, selected)) return true;
        if (m.kind === 'run' && canBridgeRunToSelected(cards, others, selected)) return true;
      }
    }
    if (others.filter((c) => c.rank === selected.rank).length >= 2) return true;
    return canFormRunWith(others, selected);
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
      {/* Stock pile */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ ...sectionLabel, color: accent, marginBottom: 4 }}>Stock ({publicState.stockSize})</div>
        <div
          onClick={canDraw ? drawStock : undefined}
          style={{
            width: 56,
            height: 80,
            border: `2px solid ${t.borderModal}`,
            borderRadius: t.radiusControl,
            background: t.cardBack,
            backgroundImage: publicState.stockSize === 0 ? 'none' : CARD_BACK_MONOGRAM,
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            cursor: canDraw ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: t.text40,
            fontSize: 11,
            boxShadow: canDraw
              ? '0 0 10px rgba(74,158,255,0.6)' // NS-1 one-off: focus-ring glow
              : '1px 2px 4px rgba(0,0,0,0.4)', // NS-1 one-off: pile shadow
            transition: 'box-shadow 0.15s',
          }}
        >
          {publicState.stockSize === 0 ? '—' : ''}
        </div>
      </div>

      {/* Discard pile */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ ...sectionLabel, color: accent, marginBottom: 4 }}>
          Discard ({publicState.discardPileSize}){is500 && publicState.discardPileSize > 1 && ' · dive'}
        </div>
        {publicState.discardTop ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* 500 Rummy: edges of buried cards peek out to the right so pile depth
                is visible without opening the dive modal. */}
            {is500 &&
              Array.from({
                length: Math.min(publicState.discardPileSize - 1, 6),
              }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 7 * (i + 1),
                    width: 56,
                    height: 80,
                    border: `2px solid ${t.cardBorder}`,
                    borderRadius: t.radiusControl,
                    background: t.cardFace,
                    // Closer edges (smaller i) paint above deeper ones; top card
                    // sits above all (zIndex below).
                    zIndex: 100 - (i + 1),
                  }}
                />
              ))}
            <CardComponent
              card={publicState.discardTop}
              {...(pileHasCards
                ? {
                    onClick: handleDiscardClick,
                    style: canDrawDiscard
                      ? { position: 'relative', zIndex: 100, boxShadow: '0 0 10px rgba(74,158,255,0.6)' } // NS-1 one-off
                      : { position: 'relative', zIndex: 100, cursor: 'pointer' },
                  }
                : { style: { position: 'relative', zIndex: 100 } })}
            />
          </div>
        ) : (
          <div
            style={{
              width: 56,
              height: 80,
              border: `2px dashed ${t.borderModal}`,
              borderRadius: t.radiusControl,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
          {...(interactive ? { onPick: handlePilePick, canPick: canPickDeep } : { readOnly: true })}
        />
      )}
    </div>
  );
}

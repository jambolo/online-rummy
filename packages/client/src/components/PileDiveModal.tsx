import { useRef, useState } from 'react';
import type { Card } from '@online-rummy/shared';
import CardComponent from './Card';
import Modal from './Modal';
import { useReducedMotion } from '../theme/useReducedMotion';
import { t } from '../theme/tokens';

interface Props {
  pile: Card[];
  // (cardId, isTopCard) — Table routes to plain draw vs drawFromPile based on isTopCard.
  onPick?: (cardId: string, isTopCard: boolean) => void;
  onClose: () => void;
  // When provided, cards for which canPick(cardId) returns false are grayed out and not
  // clickable. Used for 500 Rummy pile-dive preflight (rules.md A.4.4) so the player cannot
  // pick a deep card they cannot legally meld or lay off.
  canPick?: (cardId: string, idx: number) => boolean;
  // Read-only viewer (any-time discard pile inspection). No clicks, no highlight, no hint.
  readOnly?: boolean;
}

// 500 Rummy (rules.md A.4.4): pile dive — pick any card from the discard pile; selected card
// + every card above it goes to your hand, and the selected card must be used immediately.
// Also reused as a read-only pile viewer (any variant, any time).
export default function PileDiveModal({ pile, onPick, onClose, canPick, readOnly = false }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  // For keyboard blur debounce: clear hoverIdx only if no sibling card gains focus.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Card element refs for arrow-key navigation.
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Pile is stored bottom-to-top in protocol; render top-first for natural picking.
  const ordered = [...pile].reverse();
  const reverseIdx = (i: number) => pile.length - 1 - i;
  const isTop = (i: number) => i === 0;
  const willTake = (i: number) => !readOnly && hoverIdx !== null && i <= hoverIdx;
  const pickable = (i: number, c: Card) => !readOnly && (isTop(i) || canPick === undefined || canPick(c.id, i));

  function handleClick(card: Card, i: number) {
    if (readOnly || onPick === undefined) return;
    if (!pickable(i, card)) return;
    onPick(card.id, isTop(i));
  }

  function handleCardFocus(i: number, card: Card) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    if (!readOnly && pickable(i, card)) setHoverIdx(i);
  }

  function handleCardBlur() {
    blurTimer.current = setTimeout(() => setHoverIdx(null), 0);
  }

  function focusNeighbour(currentIdx: number, direction: 'prev' | 'next') {
    const step = direction === 'next' ? 1 : -1;
    let i = currentIdx + step;
    while (i >= 0 && i < ordered.length) {
      const card = ordered[i];
      if (card && pickable(i, card)) {
        cardRefs.current[i]?.focus();
        return;
      }
      i += step;
    }
  }

  function handleCardKeyDown(e: React.KeyboardEvent, card: Card, i: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(card, i);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusNeighbour(i, 'next');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusNeighbour(i, 'prev');
    }
  }

  return (
    <Modal
      titleId="pile-dive-title"
      onClose={onClose}
      panelStyle={{
        background: t.surfaceModalNavy,
        padding: 24,
        width: 'min(720px, calc(100vw - 32px))',
        maxHeight: '80vh',
        overflow: 'auto',
        color: t.text100,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <h2 id="pile-dive-title" style={{ fontSize: 16, margin: 0 }}>
          {readOnly ? 'Discard pile' : 'Discard pile — pick a card to take'}
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            fontSize: 22,
            padding: '0 6px',
            lineHeight: 1,
            color: t.text60,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          fontSize: 12,
          color: t.text55,
          marginBottom: 14,
        }}
      >
        {readOnly
          ? 'Top card is on the left.'
          : 'Top card on the left. The top card is a free draw (no must-use). Picking a deeper card also takes every card above it, and that card must be used in a meld or lay-off this turn. Grayed cards have no legal placement with your current hand.'}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: 6,
        }}
      >
        {ordered.map((card, i) => {
          const ok = pickable(i, card);
          const highlight = willTake(i) && ok;
          return (
            <div
              key={card.id}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              tabIndex={!readOnly && ok ? 0 : -1}
              onMouseEnter={() => !readOnly && ok && setHoverIdx(i)}
              onMouseLeave={() => !readOnly && setHoverIdx(null)}
              onFocus={() => handleCardFocus(i, card)}
              onBlur={handleCardBlur}
              onClick={() => handleClick(card, i)}
              onKeyDown={(e) => handleCardKeyDown(e, card, i)}
              style={{
                cursor: readOnly ? 'default' : ok ? 'pointer' : 'not-allowed',
                opacity: !readOnly && !ok ? 0.35 : 1,
                outline: highlight ? `3px solid ${t.accentAttention}` : '3px solid transparent',
                outlineOffset: 1,
                borderRadius: 8, // NS-1 one-off: wrapper radius, between panel(8) and card(12)
                transition: reducedMotion ? undefined : 'outline-color 0.1s, opacity 0.1s',
              }}
              title={
                readOnly
                  ? undefined
                  : !ok
                    ? 'No legal meld or lay-off possible with this card'
                    : isTop(i)
                      ? 'Take only the top card (free, no must-use)'
                      : `Take ${ordered.length - i} cards (down to position ${reverseIdx(i) + 1}); must meld or lay off ${card.rank}`
              }
            >
              <CardComponent card={card} />
            </div>
          );
        })}
      </div>
      {!readOnly && hoverIdx !== null && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: t.accentAttention,
          }}
        >
          {isTop(hoverIdx)
            ? 'Take 1 card (top) — no must-use restriction.'
            : (() => {
                const card = ordered[hoverIdx];
                if (!card) return null;
                const suit = ({ C: '♣', D: '♦', H: '♥', S: '♠' } as Record<string, string>)[card.suit];
                return `Take ${hoverIdx + 1} cards — must meld or lay off the ${card.rank}${suit} this turn.`;
              })()}
        </div>
      )}
    </Modal>
  );
}

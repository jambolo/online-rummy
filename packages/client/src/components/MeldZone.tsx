import type { Card, Meld, PublicState } from '@online-rummy/shared';
import { validateMeld, cardPoints, score500MeldCard } from '@online-rummy/shared';
import { useAppStore } from '../store';
import CardComponent from './Card';
import { t, sectionLabel } from '../theme/tokens';
import { variationAccent } from '../theme/variations';

// Can `newCard` extend `meld`? Uses shared validateMeld with gin opts (ace low only).
function canLayoffOnMeld(meld: Meld, newCard: Card): boolean {
  const meldCards = meld.cards ?? [];
  if (meldCards.length === 0) return false;
  return validateMeld([...meldCards, newCard], { aceHigh: false, roundTheCorner: false });
}

// Interim on-table score per player: value of every card they placed (melded or laid
// off), attributed via publicState.meldedBy. Only meaningful for 500 Rummy, where meld and
// layoff points accumulate during play. Gin and Basic melds do not score points. 500 uses
// per-meld ace direction (score500MeldCard).
function computeInterimScores(publicState: PublicState, resolveCard: (id: string) => Card | undefined): Map<string, number> | null {
  if (publicState.variant !== 'rum500') return null;
  const is500 = true;
  const scores = new Map<string, number>();
  for (const player of publicState.players) scores.set(player.id, 0);

  for (const player of publicState.players) {
    for (const meld of player.melds) {
      const meldCards = meld.cardIds.map((id, i) => meld.cards?.[i] ?? resolveCard(id)).filter((c): c is Card => c !== undefined);
      for (const card of meldCards) {
        const placer = publicState.meldedBy[card.id] ?? meld.ownerId;
        const pts = is500 ? score500MeldCard(card, meldCards) : cardPoints(card, 1);
        scores.set(placer, (scores.get(placer) ?? 0) + pts);
      }
    }
  }
  return scores;
}

interface MeldPileProps {
  meld: Meld;
  ownerName: string;
  pending?: boolean;
}

function MeldPile({ meld, ownerName, pending = false }: MeldPileProps) {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const selectedCardIds = useAppStore((s) => s.selectedCardIds);
  const lookupCard = useAppStore((s) => s.lookupCard);
  const meldHighlights = useAppStore((s) => s.meldHighlights);
  const send = useAppStore((s) => s.send);
  const addGinLayoff = useAppStore((s) => s.addGinLayoff);
  const ginLayoffs = useAppStore((s) => s.ginLayoffs);
  const privateState = useAppStore((s) => s.privateState);

  if (!publicState) return null;

  const isTurnPlayer = publicState.turnPlayerId === myPlayerId;
  const myMeldsCount = publicState.players.find((p) => p.id === myPlayerId)?.melds.length ?? 0;
  // 500 Rummy (rules.md A.4.6): lay off onto any meld, no own-meld prerequisite.
  // Basic (rules.md A.1.6 [WP]): own-meld required.
  const isGin = publicState.variant === 'gin';
  const ownMeldRequired = publicState.variant !== 'rum500';

  const canLayoff =
    !isGin &&
    isTurnPlayer &&
    (publicState.phase === 'meld' || publicState.phase === 'discard') &&
    (!ownMeldRequired || myMeldsCount > 0) &&
    selectedCardIds.length === 1;

  // Gin layoff phase: defender lays off onto knocker's melds (rules.md A.2.4).
  // rules.md A.2.4 "No layoff against gin": if the knocker went gin the defender may only
  // group their own melds — no layoff onto knocker melds. Detect gin via the knocker's
  // empty hand (all 10 cards melded → handCount 0).
  const ginKnockerId = publicState.variantPublic.variant === 'gin' ? publicState.variantPublic.data.ginKnockerId : null;
  const knockerWentGin = ginKnockerId !== null && publicState.players.find((p) => p.id === ginKnockerId)?.handCount === 0;
  const selectedCard = selectedCardIds.length === 1 ? lookupCard(selectedCardIds[0]!) : undefined;
  const canGinLayoff =
    isGin &&
    publicState.phase === 'layoff' &&
    isTurnPlayer &&
    !pending &&
    !knockerWentGin &&
    selectedCard !== undefined &&
    canLayoffOnMeld(meld, selectedCard);

  // Staged layoffs targeting this meld (client-side preview during layoff phase).
  const stagedLayoffs =
    isGin && publicState.phase === 'layoff'
      ? ginLayoffs
          .filter((l) => l.meldId === meld.id)
          .map((l) => {
            const card = lookupCard(l.cardId) ?? privateState?.hand.find((c) => c.id === l.cardId);
            return card ?? null;
          })
          .filter((c): c is Card => c !== null)
      : [];

  function handleLayoff() {
    const cardId = selectedCardIds[0];
    if (!cardId) return;
    send({ t: 'layoff', meldId: meld.id, cardId });
  }

  function handleGinLayoff() {
    const cardId = selectedCardIds[0];
    if (!cardId) return;
    addGinLayoff(cardId, meld.id);
  }

  return (
    <div
      style={{
        background: pending
          ? 'rgba(255,200,0,0.08)' // NS-1 one-off: pending-meld surface
          : 'rgba(0,0,0,0.15)', // NS-1 one-off: meld pile (surfacePanelMuted at 0.15)
        borderRadius: t.radiusControl,
        padding: '6px 10px',
        opacity: pending ? 0.7 : 1,
        border: pending ? '1px dashed rgba(255,200,0,0.4)' : undefined, // NS-1 one-off
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: pending
            ? 'rgba(255,200,0,0.7)' // NS-1 one-off: pending label
            : t.text50,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {ownerName} · {meld.kind}
        {pending ? ' · pending' : ''}
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
        {meld.cardIds.map((id, i) => {
          const card = meld.cards?.[i] ?? lookupCard(id);
          return card ? (
            <CardComponent
              key={id}
              card={card}
              compact
              highlighted={meldHighlights.includes(id)}
              style={{ width: 40, height: 56, fontSize: 14 }}
            />
          ) : (
            <div
              key={id}
              style={{
                width: 40,
                height: 56,
                border: `1px solid #ccc`, // NS-1 one-off: placeholder border (lighter than card-border)
                borderRadius: t.radiusChip,
                background: t.cardBack,
                flexShrink: 0,
              }}
            />
          );
        })}
        {stagedLayoffs.map((card) => (
          <CardComponent
            key={`staged-${card.id}`}
            card={card}
            compact
            style={{ width: 40, height: 56, fontSize: 11, opacity: 0.55 }}
          />
        ))}
        {canLayoff && (
          <button onClick={handleLayoff} style={{ fontSize: 11, padding: '4px 6px', marginLeft: 4 }}>
            +
          </button>
        )}
        {canGinLayoff && (
          <button onClick={handleGinLayoff} style={{ fontSize: 11, padding: '4px 6px', marginLeft: 4 }}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

export default function MeldZone() {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const ginDefenderMelds = useAppStore((s) => s.ginDefenderMelds);
  const lookupCard = useAppStore((s) => s.lookupCard);
  const privateState = useAppStore((s) => s.privateState);

  if (!publicState) return null;

  const playersWithMelds = publicState.players.filter((p) => p.melds.length > 0);

  // During gin layoff phase, the turn player is the defender. Show staged
  // defender melds as pending piles even before submission.
  const isGinLayoff = publicState.variant === 'gin' && publicState.phase === 'layoff' && publicState.turnPlayerId === myPlayerId;

  const myName = publicState.players.find((p) => p.id === myPlayerId)?.name ?? 'Me';

  // Build synthetic Meld objects for staged defender melds (client-only preview).
  const pendingMelds: Array<{ meld: Meld; ownerName: string }> = isGinLayoff
    ? ginDefenderMelds.map((cardIds, i) => {
        const cards = cardIds
          .map((id) => lookupCard(id) ?? privateState?.hand.find((c) => c.id === id))
          .filter((c): c is Card => c !== undefined);
        return {
          meld: {
            id: `pending-${i}`,
            kind: cards.length >= 3 && cards.every((c) => c.suit === cards[0]!.suit) ? 'run' : 'set',
            cardIds,
            cards,
            ownerId: myPlayerId ?? '',
          } satisfies Meld,
          ownerName: myName,
        };
      })
    : [];

  const hasAnything = playersWithMelds.length > 0 || pendingMelds.length > 0;

  if (!hasAnything) {
    return (
      <div
        style={{
          color: t.text30,
          fontSize: 12,
          fontStyle: 'italic',
        }}
      >
        No melds yet
      </div>
    );
  }

  // Sort: my melds first
  const sorted = [...playersWithMelds].sort((a) => (a.id === myPlayerId ? -1 : 1));

  // Interim meld/layoff score per player (basic + 500 Rummy only).
  const interimScores = computeInterimScores(publicState, lookupCard);
  const scoreRows = interimScores
    ? [...publicState.players]
        .sort((a) => (a.id === myPlayerId ? -1 : 1))
        .map((p) => ({ id: p.id, name: p.name, pts: interimScores.get(p.id) ?? 0 }))
        .filter((r) => r.pts > 0)
    : [];

  return (
    <div>
      <div style={{ ...sectionLabel, color: variationAccent(publicState.variant), marginBottom: 6 }}>Melds on table</div>
      {scoreRows.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 8,
            fontSize: 11,
            color: t.text70,
          }}
        >
          {scoreRows.map((r) => (
            <span key={r.id}>
              {r.name}
              {r.id === myPlayerId ? ' (you)' : ''}:{' '}
              <strong style={{ color: variationAccent(publicState.variant) }}>{r.pts}</strong>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {sorted.map((player) => player.melds.map((meld) => <MeldPile key={meld.id} meld={meld} ownerName={player.name} />))}
        {pendingMelds.map(({ meld, ownerName }) => (
          <MeldPile key={meld.id} meld={meld} ownerName={ownerName} pending />
        ))}
      </div>
    </div>
  );
}

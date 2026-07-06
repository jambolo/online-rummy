import type { Card, HouseRules } from '@online-rummy/shared';
import { RANK_INDEX, cardPoints } from '@online-rummy/shared';
import { useAppStore } from '../store';
import CardComponent from './Card';
import Modal from './Modal';
import LeaveButton from './LeaveButton';
import { t } from '../theme/tokens';
import { variationAccent, variationLabel } from '../theme/variations';

// Card point values per game variation, honoring the table's configured house rules.
// Basic: rules.md A.1.8 — unmelded ace scores 15 when aceEitherEnd or roundTheCorner
// is enabled, else 1. Gin's registry is empty, so this always yields ace = 1 there.
function cardPtsBasic(c: Card, hr: HouseRules): number {
  return cardPoints(c, hr.aceEitherEnd === true || hr.roundTheCorner === true ? 15 : 1);
}
// 500 Rummy: rules.md A.4.2 — hand ace always 15; low5Scoring scores 2-9 at 5.
function cardPts500(c: Card, hr: HouseRules): number {
  return cardPoints(c, 15, { low5Scoring: hr.low5Scoring === true });
}
function handPts(cards: Card[], ptsFn: (c: Card) => number): number {
  return cards.reduce((s, c) => s + ptsFn(c), 0);
}
const SUIT_ORDER: Record<string, number> = { S: 3, H: 2, D: 1, C: 0 };
function sortCardsDesc(cards: Card[], pointsFor: (c: Card) => number): Card[] {
  return [...cards].sort((a, b) => {
    const pts = pointsFor(b) - pointsFor(a);
    if (pts !== 0) return pts;
    const rank = RANK_INDEX[b.rank] - RANK_INDEX[a.rank];
    if (rank !== 0) return rank;
    return (SUIT_ORDER[b.suit] ?? 0) - (SUIT_ORDER[a.suit] ?? 0);
  });
}

export default function ScoreOverlay() {
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

  if (!publicState || publicState.phase !== 'ended') return null;

  const isHost = myPlayerId === hostId;
  const sorted = [...publicState.players].sort((a, b) => b.score - a.score);
  const is500 = publicState.variant === 'rum500';
  const isGin = publicState.variant === 'gin';
  const hr = publicState.houseRules;
  const cardPts = (c: Card) => (is500 ? cardPts500(c, hr) : cardPtsBasic(c, hr));
  const gameTarget = is500 ? 500 : 100;

  // rules.md A.2.3 stock-depletion cancel: no scoring; show simple banner + Re-deal.
  if (handCancelled) {
    return (
      <Modal
        titleId="score-overlay-title"
        z={t.zScoreOverlay}
        panelStyle={{
          background: t.surfaceModalGreen,
          padding: 32,
          width: 340,
          textAlign: 'center',
        }}
      >
        <h2 id="score-overlay-title" style={{ marginBottom: 8 }}>
          Hand Cancelled
        </h2>
        <div style={{ fontSize: 13, color: t.text70, marginBottom: 20 }}>
          Stock ran low before anyone knocked. No score this hand — same dealer re-deals.
        </div>
        {sorted.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.1)', // NS-1 one-off: row divider
              fontSize: 13,
            }}
          >
            <span>
              {p.name}
              {p.id === myPlayerId ? ' (you)' : ''}
            </span>
            <span>{p.score} pts</span>
          </div>
        ))}
        {isHost ? (
          <button className="primary" onClick={() => send({ t: 'start' })} style={{ width: '100%', marginTop: 20 }}>
            Re-deal
          </button>
        ) : (
          <div
            style={{
              textAlign: 'center',
              marginTop: 20,
              color: t.text50,
              fontSize: 13,
            }}
          >
            Waiting for host…
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <LeaveButton />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titleId="score-overlay-title"
      z={t.zScoreOverlay}
      panelStyle={{
        background: t.surfaceModalGreen,
        padding: 32,
        width: 340,
      }}
    >
      <h2 id="score-overlay-title" style={{ textAlign: 'center', marginBottom: 4 }}>
        {isGameOver ? 'Game Over!' : 'Hand Over'}
      </h2>
      <div
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: variationAccent(publicState.variant),
          fontWeight: 'bold',
          marginBottom: 2,
        }}
      >
        {variationLabel(publicState.variant)}
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: t.text50,
          marginBottom: 20,
        }}
      >
        {isGameOver ? `A player reached ${gameTarget} pts` : `Game target: ${gameTarget} pts`}
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
              padding: '10px 0',
              borderBottom: '1px solid rgba(255,255,255,0.1)', // NS-1 one-off: row divider
            }}
          >
            {/* Name + scores row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: isWinner ? 15 : 13,
                fontWeight: isWinner ? 'bold' : 'normal',
              }}
            >
              <span>
                {isWinner ? '🏆 ' : ''}
                {p.name}
                {p.id === myPlayerId ? ' (you)' : ''}
              </span>
              <span style={{ display: 'flex', gap: 16 }}>
                {/* Non-color delta cue [V7]: ▲/▼ arrow beside the green/salmon color. */}
                <span
                  style={{
                    color: delta > 0 ? t.accentPositive : delta < 0 ? t.accentNegative : t.text40,
                    fontSize: 13,
                  }}
                >
                  {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '—'}
                </span>
                <span style={{ minWidth: 52, textAlign: 'right' }}>{p.score} pts</span>
              </span>
            </div>

            {/* Gin result */}
            {isGin && ginInfo && (
              <div style={{ fontSize: 11, color: t.text50, marginTop: 3 }}>
                {p.id === ginInfo.knockerId
                  ? ginInfo.result === 'gin'
                    ? `Gin! — 0 deadwood (+20 gin bonus, +20 box)`
                    : ginInfo.result === 'knock'
                      ? `Knocked — ${ginInfo.knockerDeadwood} deadwood (+20 box)`
                      : `Knocked — ${ginInfo.knockerDeadwood} deadwood (undercut!)`
                  : ginInfo.result === 'undercut'
                    ? `Undercut! — ${ginInfo.defenderDeadwood} deadwood (+10 undercut, +20 box)`
                    : `${ginInfo.defenderDeadwood} deadwood`}
              </div>
            )}
            {/* Score explanation — basic only */}
            {!is500 && !isGin && isWinner && delta > 0 && (
              <div style={{ fontSize: 11, color: t.text50, marginTop: 3 }}>
                Won hand — scored {delta} pts from opponents' unmelded cards
              </div>
            )}

            {/* Melded cards credited to this player */}
            {(() => {
              const credited = [...(meldCredits[p.id] ?? [])].sort((a, b) => b.pts - a.pts);
              if (credited.length === 0) return null;
              const meldedPts = credited.reduce((s, x) => s + x.pts, 0);
              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: t.text50, marginBottom: 4 }}>
                    {p.id === myPlayerId ? 'Your' : `${p.name}'s`} melded cards (+{meldedPts} pts):
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {credited.map(({ card, pts }) => (
                      <div key={card.id} style={{ position: 'relative' }}>
                        <CardComponent card={card} compact style={{ width: 36, height: 50, fontSize: 10 }} />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 2,
                            right: 3,
                            fontSize: 9,
                            color: t.accentMeldCredit,
                            fontWeight: 'bold',
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

            {/* Unmelded cards breakdown */}
            {playerCards.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 11, color: t.text50, marginBottom: 4 }}>
                  {p.id === myPlayerId ? 'Your' : `${p.name}'s`} unmelded cards ({is500 ? `−${playerCardPts}` : playerCardPts} pts):
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {playerCards.map((c) => (
                    <div key={c.id} style={{ position: 'relative' }}>
                      <CardComponent card={c} compact style={{ width: 36, height: 50, fontSize: 10 }} />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 2,
                          right: 3,
                          fontSize: 9,
                          color: t.accentDeadwoodBadge,
                          fontWeight: 'bold',
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
        <button className="primary" onClick={() => send({ t: 'start' })} style={{ width: '100%', marginTop: 20 }}>
          {isGameOver ? 'Play Again' : 'New Hand'}
        </button>
      ) : (
        <div
          style={{
            textAlign: 'center',
            marginTop: 20,
            color: t.text50,
            fontSize: 13,
          }}
        >
          Waiting for host…
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <LeaveButton />
      </div>
    </Modal>
  );
}

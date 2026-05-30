import type { Card, Meld } from "@online-rummy/shared";
import { validateMeld } from "@online-rummy/shared";
import { useAppStore } from "../store";
import CardComponent from "./Card";

// Can `newCard` extend `meld`? Uses shared validateMeld with gin opts (ace low only).
function canLayoffOnMeld(meld: Meld, newCard: Card): boolean {
  const meldCards = meld.cards ?? [];
  if (meldCards.length === 0) return false;
  return validateMeld([...meldCards, newCard], { aceHigh: false, roundTheCorner: false });
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
  const send = useAppStore((s) => s.send);
  const addGinLayoff = useAppStore((s) => s.addGinLayoff);
  const ginLayoffs = useAppStore((s) => s.ginLayoffs);
  const privateState = useAppStore((s) => s.privateState);

  if (!publicState) return null;

  const isTurnPlayer = publicState.turnPlayerId === myPlayerId;
  const myMeldsCount =
    publicState.players.find((p) => p.id === myPlayerId)?.melds.length ?? 0;
  // 500 Rum (rules.md A.4.6): lay off onto any meld, no own-meld prerequisite.
  // Basic (rules.md A.1.6 [WP]): own-meld required.
  const isGin = publicState.variant === "gin";
  const ownMeldRequired = publicState.variant !== "rum500";

  const canLayoff =
    !isGin &&
    isTurnPlayer &&
    (publicState.phase === "meld" || publicState.phase === "discard") &&
    (!ownMeldRequired || myMeldsCount > 0) &&
    selectedCardIds.length === 1;

  // Gin layoff phase: defender lays off onto knocker's melds (rules.md A.2.3).
  const selectedCard = selectedCardIds.length === 1
    ? lookupCard(selectedCardIds[0]!)
    : undefined;
  const canGinLayoff =
    isGin &&
    publicState.phase === "layoff" &&
    isTurnPlayer &&
    !pending &&
    selectedCard !== undefined &&
    canLayoffOnMeld(meld, selectedCard);

  // Staged layoffs targeting this meld (client-side preview during layoff phase).
  const stagedLayoffs = isGin && publicState.phase === "layoff"
    ? ginLayoffs
        .filter((l) => l.meldId === meld.id)
        .map((l) => {
          const card = lookupCard(l.cardId) ??
            privateState?.hand.find((c) => c.id === l.cardId);
          return card ?? null;
        })
        .filter((c): c is Card => c !== null)
    : [];

  function handleLayoff() {
    const cardId = selectedCardIds[0];
    if (!cardId) return;
    send({ t: "layoff", meldId: meld.id, cardId });
  }

  function handleGinLayoff() {
    const cardId = selectedCardIds[0];
    if (!cardId) return;
    addGinLayoff(cardId, meld.id);
  }

  return (
    <div
      style={{
        background: pending ? "rgba(255,200,0,0.08)" : "rgba(0,0,0,0.15)",
        borderRadius: 6,
        padding: "6px 10px",
        opacity: pending ? 0.7 : 1,
        border: pending ? "1px dashed rgba(255,200,0,0.4)" : undefined,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: pending ? "rgba(255,200,0,0.7)" : "rgba(255,255,255,0.5)",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {ownerName} · {meld.kind}{pending ? " · pending" : ""}
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
        {meld.cardIds.map((id, i) => {
          const card = meld.cards?.[i] ?? lookupCard(id);
          return card ? (
            <CardComponent
              key={id}
              card={card}
              compact
              style={{ width: 40, height: 56, fontSize: 14 }}
            />
          ) : (
            <div
              key={id}
              style={{
                width: 40,
                height: 56,
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "#1a3a8a",
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
          <button
            onClick={handleLayoff}
            style={{ fontSize: 11, padding: "4px 6px", marginLeft: 4 }}
          >
            +
          </button>
        )}
        {canGinLayoff && (
          <button
            onClick={handleGinLayoff}
            style={{ fontSize: 11, padding: "4px 6px", marginLeft: 4 }}
          >
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

  const playersWithMelds = publicState.players.filter(
    (p) => p.melds.length > 0
  );

  // During gin layoff phase, the turn player is the defender. Show staged
  // defender melds as pending piles even before submission.
  const isGinLayoff =
    publicState.variant === "gin" &&
    publicState.phase === "layoff" &&
    publicState.turnPlayerId === myPlayerId;

  const myName =
    publicState.players.find((p) => p.id === myPlayerId)?.name ?? "Me";

  // Build synthetic Meld objects for staged defender melds (client-only preview).
  const pendingMelds: Array<{ meld: Meld; ownerName: string }> = isGinLayoff
    ? ginDefenderMelds.map((cardIds, i) => {
        const cards = cardIds
          .map((id) => lookupCard(id) ?? privateState?.hand.find((c) => c.id === id))
          .filter((c): c is Card => c !== undefined);
        return {
          meld: {
            id: `pending-${i}`,
            kind: cards.length >= 3 && cards.every(c => c.suit === cards[0]!.suit) ? "run" : "set",
            cardIds,
            cards,
            ownerId: myPlayerId ?? "",
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
          color: "rgba(255,255,255,0.3)",
          fontSize: 12,
          fontStyle: "italic",
        }}
      >
        No melds yet
      </div>
    );
  }

  // Sort: my melds first
  const sorted = [...playersWithMelds].sort((a) =>
    a.id === myPlayerId ? -1 : 1
  );

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Melds on table
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {sorted.map((player) =>
          player.melds.map((meld) => (
            <MeldPile key={meld.id} meld={meld} ownerName={player.name} />
          ))
        )}
        {pendingMelds.map(({ meld, ownerName }) => (
          <MeldPile key={meld.id} meld={meld} ownerName={ownerName} pending />
        ))}
      </div>
    </div>
  );
}

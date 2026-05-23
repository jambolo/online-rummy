import type { Meld } from "@online-rummy/shared";
import { useAppStore } from "../store";
import CardComponent from "./Card";

interface MeldPileProps {
  meld: Meld;
  ownerName: string;
}

function MeldPile({ meld, ownerName }: MeldPileProps) {
  const publicState = useAppStore((s) => s.publicState);
  const myPlayerId = useAppStore((s) => s.myPlayerId);
  const selectedCardIds = useAppStore((s) => s.selectedCardIds);
  const lookupCard = useAppStore((s) => s.lookupCard);
  const send = useAppStore((s) => s.send);

  if (!publicState) return null;

  const isTurnPlayer = publicState.turnPlayerId === myPlayerId;
  const myMeldsCount =
    publicState.players.find((p) => p.id === myPlayerId)?.melds.length ?? 0;
  // 500 Rum (rules.md A.4.6): lay off onto any meld, no own-meld prerequisite.
  // Basic (rules.md A.1.6 [WP]): own-meld required.
  const ownMeldRequired = publicState.variant !== "rum500";

  const canLayoff =
    isTurnPlayer &&
    (publicState.phase === "meld" || publicState.phase === "discard") &&
    (!ownMeldRequired || myMeldsCount > 0) &&
    selectedCardIds.length === 1;

  function handleLayoff() {
    const cardId = selectedCardIds[0];
    if (!cardId) return;
    send({ t: "layoff", meldId: meld.id, cardId });
  }

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.15)",
        borderRadius: 6,
        padding: "6px 10px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {ownerName} · {meld.kind}
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
        {meld.cardIds.map((id, i) => {
          const card = meld.cards?.[i] ?? lookupCard(id);
          return card ? (
            <CardComponent
              key={id}
              card={card}
              compact
              style={{ width: 40, height: 56, fontSize: 11 }}
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
        {canLayoff && (
          <button
            onClick={handleLayoff}
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

  if (!publicState) return null;

  const playersWithMelds = publicState.players.filter(
    (p) => p.melds.length > 0
  );

  if (playersWithMelds.length === 0) {
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
      </div>
    </div>
  );
}

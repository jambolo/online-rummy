import type { Card, Suit } from "@online-rummy/shared";
import { t } from "../theme/tokens";

const SUIT_SYMBOL: Record<Suit, string> = {
  C: "♣",
  D: "♦",
  H: "♥",
  S: "♠",
};

const RED: Set<Suit> = new Set(["D", "H"]);

interface Props {
  card: Card;
  selected?: boolean;
  dimmed?: boolean;
  /** Compact: show only top-left corner (no center symbol, no bottom corner).
   *  Use for small meld-zone cards. Caller controls text size via `style.fontSize`. */
  compact?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function CardComponent({
  card,
  selected = false,
  dimmed = false,
  compact = false,
  onClick,
  style,
}: Props) {
  const isRed = RED.has(card.suit);
  const sym = SUIT_SYMBOL[card.suit];

  const cornerStyle: React.CSSProperties = compact
    ? { fontWeight: "bold", lineHeight: 1 }
    : { fontSize: 16, fontWeight: "bold", lineHeight: 1 };

  return (
    <div
      onClick={onClick}
      style={{
        width: 56,
        height: 80,
        // textAlign: left prevents inheriting "center" from Table wrappers.
        textAlign: "left",
        border: `2px solid ${selected ? t.focusRing : t.cardBorder}`,
        borderRadius: t.radiusControl,
        background: dimmed ? t.cardFaceDimmed : t.cardFace,
        color: isRed ? t.cardRed : t.cardBlack,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "3px 5px",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        transform: selected ? "translateY(-10px)" : "none",
        transition: "transform 0.1s, border-color 0.1s, box-shadow 0.1s",
        boxShadow: selected
          ? "0 4px 12px rgba(74,158,255,0.5)" // NS-1 one-off: focus-ring at 50% opacity
          : "1px 2px 4px rgba(0,0,0,0.25)",    // NS-1 one-off: card drop shadow
        opacity: dimmed ? 0.5 : 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Top-left corner */}
      <div style={cornerStyle}>
        {card.rank}{sym}
      </div>

      {/* Center suit — full-size only */}
      {!compact && (
        <div style={{ fontSize: 30, textAlign: "center", lineHeight: 1 }}> {/* NS-1 one-off: 30px not in type scale */}
          {sym}
        </div>
      )}

      {/* Bottom-right corner — full-size only */}
      {!compact && (
        <div
          style={{
            ...cornerStyle,
            transform: "rotate(180deg)",
            alignSelf: "flex-end",
          }}
        >
          {card.rank}{sym}
        </div>
      )}
    </div>
  );
}

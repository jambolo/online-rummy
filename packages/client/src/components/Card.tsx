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
  /** Amber glow marking a card melded/laid off on the current (or just-prior) turn. */
  highlighted?: boolean;
  /** Gin staging cue for cards in hand: 'meld' (grouped into a knock/defender meld, green)
   *  or 'layoff' (staged onto a knocker meld, blue) — matches the ActionBar chip colors. */
  marker?: "meld" | "layoff";
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
  highlighted = false,
  marker,
  compact = false,
  onClick,
  style,
}: Props) {
  const isRed = RED.has(card.suit);
  const sym = SUIT_SYMBOL[card.suit];

  const cornerStyle: React.CSSProperties = compact
    ? { fontWeight: "bold", lineHeight: 1 }
    : { fontSize: 16, fontWeight: "bold", lineHeight: 1 };

  // Gin staging cue: green (grouped meld) / blue (staged layoff). Mirrors the
  // ActionBar chip palette (--chip-meld / --chip-layoff). NS-1 one-off literals.
  const markerColor =
    marker === "meld" ? "#7fff7f" : marker === "layoff" ? "#64a0ff" : null;
  const markerGlow =
    marker === "meld"
      ? "rgba(127,255,127,0.7)"
      : marker === "layoff"
      ? "rgba(100,160,255,0.7)"
      : null;

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        width: 56,
        height: 80,
        // textAlign: left prevents inheriting "center" from Table wrappers.
        textAlign: "left",
        border: `2px solid ${
          selected
            ? t.focusRing
            : (markerColor ?? (highlighted ? "#e3a33b" : t.cardBorder))
        }`, // NS-1 one-off: amber highlight / green-blue gin-staging marker
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
          ? "0 4px 12px rgba(74,158,255,0.5)"   // NS-1 one-off: focus-ring at 50% opacity
          : markerGlow
          ? `0 0 8px 2px ${markerGlow}`         // NS-1 one-off: gin-staging marker glow
          : highlighted
          ? "0 0 8px 2px rgba(227,163,59,0.7)"  // NS-1 one-off: amber glow for just-melded cards
          : "1px 2px 4px rgba(0,0,0,0.25)",     // NS-1 one-off: card drop shadow
        opacity: dimmed ? 0.5 : 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Non-color cue [V7] for the gin-staging marker: glyph badge. */}
      {marker && markerColor && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            background: markerColor,
            color: "#15110c",
            fontSize: 9,
            fontWeight: "bold",
            lineHeight: 1,
            borderRadius: 8,
            padding: "2px 4px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
          }}
        >
          {marker === "meld" ? "✓" : "↪"}
        </div>
      )}
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

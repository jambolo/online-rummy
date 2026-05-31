import type { CSSProperties } from 'react';

// CSS custom property references for inline React.CSSProperties.
// Runtime values are declared in index.html :root — this module provides
// type-safe aliases so components never repeat a raw var() string.
export const t = {
  // Surface & brand
  surfaceFelt:       'var(--surface-felt)',
  surfacePanel:      'var(--surface-panel)',
  surfacePanelMuted: 'var(--surface-panel-muted)',
  surfaceModalGreen: 'var(--surface-modal-green)',
  surfaceModalNavy:  'var(--surface-modal-navy)',
  scrim:             'var(--scrim)',
  borderModal:       'var(--border-modal)',
  cardFace:          'var(--card-face)',
  cardFaceDimmed:    'var(--card-face-dimmed)',
  cardBack:          'var(--card-back)',
  cardBorder:        'var(--card-border)',
  cardRed:           'var(--card-red)',
  cardBlack:         'var(--card-black)',

  // Text ramp (white at decreasing opacity)
  text100: 'var(--text-100)',
  text85:  'var(--text-85)',
  text70:  'var(--text-70)',
  text60:  'var(--text-60)',
  text55:  'var(--text-55)',
  text50:  'var(--text-50)',
  text45:  'var(--text-45)',
  text40:  'var(--text-40)',
  text30:  'var(--text-30)',

  // Controls
  btnDefault: 'var(--btn-default)',
  btnPrimary: 'var(--btn-primary)',
  btnDanger:  'var(--btn-danger)',
  focusRing:  'var(--focus-ring)',

  // Semantic accents
  accentSelf:          'var(--accent-self)',
  accentHost:          'var(--accent-host)',
  accentAttention:     'var(--accent-attention)',
  accentPositive:      'var(--accent-positive)',
  accentNegative:      'var(--accent-negative)',
  accentGin:           'var(--accent-gin)',
  accentMeldCredit:    'var(--accent-meld-credit)',
  accentDeadwoodBadge: 'var(--accent-deadwood-badge)',

  // Radius (numeric — React CSSProperties takes px numbers)
  radiusCard:    12,
  radiusPanel:   8,
  radiusControl: 6,
  radiusChip:    4,

  // z-index
  zCardDrag:     10,
  zScoreOverlay: 100,
  zModal:        200,

  // Font weights
  weightRegular:  400,
  weightMedium:   500,
  weightSemibold: 600,
  weightBold:     700,
} as const;

// Section-label idiom [V5] — promoted from repeated inline cluster.
// Usage: <div style={{ ...sectionLabel, marginBottom: 4 }}>
export const sectionLabel: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: t.text60,
};

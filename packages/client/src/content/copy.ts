// Central UI copy module (T-GAP-2).
// Single source of truth for branded, thematic strings (branding.md "Gold Standard"
// speakeasy direction). Components import from here instead of inlining prose, so the
// brand voice stays consistent and is changed in one place.
//
// Game-variation display names live in src/theme/variations.ts (variationLabel) — not here.

export const copy = {
  app: {
    tagline: 'The Ultimate Rummy Club',
  },
  home: {
    nameLabel: 'Your name',
    namePlaceholder: 'e.g. Alice',
    createTab: 'Open a Room',
    joinTab: 'Join a Room',
    variationLabel: 'Game variation',
    codeLabel: 'Room code',
    codePlaceholder: '5-letter code',
    createCta: 'Enter the High-Stakes Room',
    joinCta: 'Slip in the Back Door',
    connecting: 'Connecting to the club…',
  },
  chat: {
    title: 'The Backroom',
    placeholder: 'Say something…',
    empty: 'Nothing said yet',
  },
  // Thematic rank ladder (branding.md §2) — reserved for NS-5 identity/progression.
  ranks: [
    'Associate',
    'Bootlegger',
    'Runner',
    'Distiller',
    'Smuggler',
    'Enforcer',
    'Capo',
    'Kingpin',
    'The Don',
  ],
} as const;

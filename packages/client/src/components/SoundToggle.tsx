import { useSyncExternalStore } from 'react';
import { getMuted, setMuted, subscribeMuted } from '../audio/sounds';
import { t } from '../theme/tokens';

// Mute-toggle icon button; styled to match the "How to Play" header button.
export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, getMuted);
  return (
    <button
      onClick={() => setMuted(!getMuted())}
      // WAI-ARIA toggle-button pattern: constant label, state via aria-pressed —
      // a label that flips with the state reads contradictorily ("Unmute, pressed").
      aria-label="Mute sounds"
      aria-pressed={muted}
      style={{
        background: 'transparent',
        border: `1px solid ${t.borderModal}`,
        color: t.text60,
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 5, // NS-1 one-off: between chip(4) and control(6)
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
